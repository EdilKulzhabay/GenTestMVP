import fs from 'fs/promises';
import mongoose from 'mongoose';
import { CanonicalRoadmap } from '../models/CanonicalRoadmap.model';
import { UserRoadmapProgress, normalizeStoredNodeProgress } from '../models/UserRoadmapProgress.model';
import { RoadmapAttempt } from '../models/RoadmapAttempt.model';
import { Subject, User, Test } from '../models';
import { roadmapAIService } from './roadmap.ai.service';
import { parseCanonicalNodesFromPayload } from '../utils/roadmapJson';
import { firstExistingCanonicalRoadmapFile } from '../utils/canonicalRoadmapPaths';
import { assertValidCanonicalNodes } from '../utils/roadmapGraph';
import { buildTopicCanonicalNodes } from '../utils/roadmapChapter.util';
import {
  ICanonicalRoadmapNode,
  ICanonicalRoadmapSourceMeta,
  IPersonalRoadmapNodeView,
  IUserRoadmapNodeProgress,
  INextRecommended,
  IRoadmapPickerSubjectItem,
  RoadmapAvailability
} from '../types/roadmap.types';
import {
  ROADMAP_TOP_K_RECOMMENDATIONS,
  ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT,
  ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK,
  isMasteredByBestScore,
  isMasteredByTrialScore,
  RecommendedReasonCode
} from '../roadmap/roadmap.rules';
import { AppError } from '../utils';

type CanonicalBundle = {
  version: number;
  nodes: ICanonicalRoadmapNode[];
  description?: string;
  sourceMeta?: ICanonicalRoadmapSourceMeta;
  fromChapters: boolean;
};

function defaultProgress(nodeId: string): IUserRoadmapNodeProgress {
  return { nodeId, mastered: false, bestScore: 0, lowScoreFailCount: 0 };
}

function progressMap(nodes: IUserRoadmapNodeProgress[]): Map<string, IUserRoadmapNodeProgress> {
  return new Map(nodes.map((n) => [n.nodeId, n]));
}

function masteredSet(
  canonicalNodes: ICanonicalRoadmapNode[],
  progressByNode: Map<string, IUserRoadmapNodeProgress>
): Set<string> {
  const set = new Set<string>();
  for (const cn of canonicalNodes) {
    const p = progressByNode.get(cn.nodeId);
    if (p?.mastered) set.add(cn.nodeId);
  }
  return set;
}

function availabilityForNode(
  node: ICanonicalRoadmapNode,
  mastered: Set<string>
): RoadmapAvailability {
  if (node.prerequisites.length === 0) return 'available';
  const allDone = node.prerequisites.every((id) => mastered.has(id));
  return allDone ? 'available' : 'locked';
}

function unlocksCount(
  nodeId: string,
  canonicalNodes: ICanonicalRoadmapNode[],
  mastered: Set<string>
): number {
  const hypothetical = new Set(mastered);
  hypothetical.add(nodeId);
  let count = 0;
  for (const n of canonicalNodes) {
    if (hypothetical.has(n.nodeId)) continue;
    if (n.prerequisites.length === 0) continue;
    const wasLocked = !n.prerequisites.every((id) => mastered.has(id));
    const nowAvail = n.prerequisites.every((id) => hypothetical.has(id));
    if (wasLocked && nowAvail) count++;
  }
  return count;
}

function reasonForNode(
  p: IUserRoadmapNodeProgress,
  unlocks: number,
  isMainPath: boolean
): RecommendedReasonCode {
  if (p.bestScore > 0 && !p.mastered) return 'CONTINUE_IN_PROGRESS';
  if (unlocks > 0) return 'UNLOCKS_NEXT_TOPICS';
  if (p.bestScore > 0 && p.bestScore < 50 && !p.mastered) return 'LOW_MASTERY';
  if (isMainPath) return 'PART_OF_MAIN_PATH';
  return 'NOT_STARTED';
}

function compareFrontier(
  a: { node: ICanonicalRoadmapNode; p: IUserRoadmapNodeProgress; unlocks: number },
  b: { node: ICanonicalRoadmapNode; p: IUserRoadmapNodeProgress; unlocks: number }
): number {
  const aInProg = a.p.bestScore > 0 && !a.p.mastered ? 1 : 0;
  const bInProg = b.p.bestScore > 0 && !b.p.mastered ? 1 : 0;
  if (bInProg !== aInProg) return bInProg - aInProg;
  if (b.unlocks !== a.unlocks) return b.unlocks - a.unlocks;
  return a.p.bestScore - b.p.bestScore;
}

class RoadmapService {
  private async trySeedCanonicalFromStaticFile(subjectId: string): Promise<void> {
    const exists = await CanonicalRoadmap.findOne({ subjectId }).sort({ version: -1 }).lean();
    if (exists) return;

    const filePath = firstExistingCanonicalRoadmapFile(subjectId);
    if (!filePath) return;

    const text = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    const { nodes, version, description } = parseCanonicalNodesFromPayload(parsed);
    assertValidCanonicalNodes(nodes);

    const subjectObjectId = new mongoose.Types.ObjectId(subjectId);
    const ver = typeof version === 'number' ? version : 1;

    try {
      await CanonicalRoadmap.findOneAndUpdate(
        { subjectId: subjectObjectId },
        {
          $set: {
            subjectId: subjectObjectId,
            version: ver,
            nodes,
            ...(description ? { description } : {})
          },
          $unset: { sourceMeta: 1 }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code !== 11000) throw err;
    }
  }

  /**
   * Приоритет: узлы по темам учебника (авто). Иначе — Mongo canonical или JSON-файл.
   */
  async resolveCanonical(subjectId: string): Promise<CanonicalBundle> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId).lean();
    if (!subject) throw AppError.notFound('Subject not found');

    const topicNodes = buildTopicCanonicalNodes(subject);
    if (topicNodes.length > 0) {
      const updatedAt = (subject as { updatedAt?: Date }).updatedAt;
      const version = Math.max(
        1,
        Math.floor((updatedAt ? new Date(updatedAt).getTime() : Date.now()) / 1000)
      );
      return { version, nodes: topicNodes, fromChapters: true };
    }

    let doc = await CanonicalRoadmap.findOne({ subjectId }).sort({ version: -1 }).lean();
    if (!doc) {
      await this.trySeedCanonicalFromStaticFile(subjectId);
      doc = await CanonicalRoadmap.findOne({ subjectId }).sort({ version: -1 }).lean();
    }
    if (!doc) {
      throw AppError.notFound('Canonical roadmap not configured for this subject');
    }

    return {
      version: doc.version,
      nodes: doc.nodes as ICanonicalRoadmapNode[],
      description:
        'description' in doc && typeof doc.description === 'string' ? doc.description : undefined,
      sourceMeta: doc.sourceMeta,
      fromChapters: false
    };
  }

  /**
   * Проверка перед POST /tests/generate и /tests/solo/start при roadmapNodeId в теле.
   */
  async assertKnowledgeMapTestAllowed(
    userId: string,
    subjectId: string,
    roadmapNodeId: string | undefined
  ): Promise<void> {
    const nid = roadmapNodeId?.trim();
    if (!nid) return;
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const bundle = await this.resolveCanonical(subjectId);
    if (!bundle.nodes.some((n) => n.nodeId === nid)) {
      throw AppError.badRequest('Unknown roadmapNodeId for this subject');
    }
    const raw = await UserRoadmapProgress.findOne({ userId, subjectId }).lean();
    const merged = this.mergeProgressWithCanonical(bundle.nodes, raw?.nodes ?? []);
    const p = progressMap(merged).get(nid);
    const count = p?.lowScoreFailCount ?? 0;
    if (count >= ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK) {
      throw AppError.forbidden(
        'По этой теме уже трижды не набрали 80%. Повторите материал и нажмите «Освоил» на странице урока, затем снова откроется тест.'
      );
    }
  }

  private mergeProgressWithCanonical(
    canonicalNodes: ICanonicalRoadmapNode[],
    existingRaw: unknown[]
  ): IUserRoadmapNodeProgress[] {
    const map = new Map<string, IUserRoadmapNodeProgress>();
    for (const raw of existingRaw) {
      const n = normalizeStoredNodeProgress(raw);
      map.set(n.nodeId, n);
    }
    const out: IUserRoadmapNodeProgress[] = [];
    for (const cn of canonicalNodes) {
      out.push(map.get(cn.nodeId) ?? defaultProgress(cn.nodeId));
    }
    return out;
  }

  async getCanonical(subjectId: string) {
    const bundle = await this.resolveCanonical(subjectId);
    const subjectOid = new mongoose.Types.ObjectId(subjectId);

    const nodes = await Promise.all(
      bundle.nodes.map(async (n) => {
        const meta = (
          n.metadata && typeof n.metadata === 'object' ? n.metadata : {}
        ) as Record<string, unknown>;
        const bookId = typeof meta.bookId === 'string' ? meta.bookId : undefined;
        const chapterId = typeof meta.chapterId === 'string' ? meta.chapterId : undefined;
        const topicId = typeof meta.topicId === 'string' ? meta.topicId : undefined;
        let testId: string | undefined;
        if (bookId && chapterId) {
          const t = await Test.findOne({ subjectId: subjectOid, bookId, chapterId })
            .sort({ createdAt: -1 })
            .select('_id')
            .lean();
          testId = t?._id?.toString();
        }
        const chapterUrl =
          bookId && chapterId
            ? `/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}${
                topicId ? `#topic-${topicId}` : ''
              }`
            : undefined;

        return {
          nodeId: n.nodeId,
          title: n.title,
          ...(n.description?.trim() ? { description: n.description.trim() } : {}),
          prerequisites: n.prerequisites || [],
          metadata: n.metadata,
          ...(chapterUrl
            ? { chapterUrl, bookId, chapterId, ...(topicId ? { topicId } : {}) }
            : {}),
          ...(testId ? { testId } : {})
        };
      })
    );

    const roadmapDescription =
      typeof bundle.description === 'string' ? bundle.description.trim() : '';

    return {
      subjectId,
      version: bundle.version,
      ...(roadmapDescription ? { description: roadmapDescription } : {}),
      nodes,
      ...(bundle.sourceMeta ? { sourceMeta: bundle.sourceMeta } : {})
    };
  }

  private async enrichPersonalNodeView(
    subjectId: string,
    cn: ICanonicalRoadmapNode,
    base: Omit<
      IPersonalRoadmapNodeView,
      'chapterUrl' | 'bookId' | 'chapterId' | 'topicId' | 'testId'
    >
  ): Promise<IPersonalRoadmapNodeView> {
    const meta = (
      cn.metadata && typeof cn.metadata === 'object' ? cn.metadata : {}
    ) as Record<string, unknown>;
    const bookId = typeof meta.bookId === 'string' ? meta.bookId : undefined;
    const chapterId = typeof meta.chapterId === 'string' ? meta.chapterId : undefined;
    const topicId = typeof meta.topicId === 'string' ? meta.topicId : undefined;
    let testId: string | undefined;
    if (bookId && chapterId) {
      const t = await Test.findOne({
        subjectId: new mongoose.Types.ObjectId(subjectId),
        bookId,
        chapterId
      })
        .sort({ createdAt: -1 })
        .select('_id')
        .lean();
      testId = t?._id?.toString();
    }
    const chapterUrl =
      bookId && chapterId
        ? `/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}${
            topicId ? `#topic-${topicId}` : ''
          }`
        : undefined;
    return {
      ...base,
      ...(chapterUrl
        ? { chapterUrl, bookId, chapterId, ...(topicId ? { topicId } : {}) }
        : {}),
      ...(testId ? { testId } : {})
    };
  }

  async getPersonalSnapshot(
    userId: string,
    subjectId: string,
    options?: { includeAiInsights?: boolean }
  ) {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId);
    if (!subject) throw AppError.notFound('Subject not found');

    const bundle = await this.resolveCanonical(subjectId);
    const canonicalNodes = bundle.nodes;

    let rawProgress = await UserRoadmapProgress.findOne({ userId, subjectId }).lean();

    if (!rawProgress) {
      const merged = this.mergeProgressWithCanonical(canonicalNodes, []);
      rawProgress = await UserRoadmapProgress.findOneAndUpdate(
        { userId, subjectId },
        {
          $set: { canonicalVersion: bundle.version, nodes: merged },
          $setOnInsert: { userId, subjectId }
        },
        { upsert: true, new: true }
      ).lean();
    } else {
      const merged = this.mergeProgressWithCanonical(canonicalNodes, rawProgress.nodes ?? []);
      if (merged.length !== rawProgress.nodes.length || rawProgress.canonicalVersion !== bundle.version) {
        rawProgress = await UserRoadmapProgress.findOneAndUpdate(
          { userId, subjectId },
          { $set: { canonicalVersion: bundle.version, nodes: merged } },
          { new: true }
        ).lean();
      }
    }

    const progressByNode = progressMap(
      this.mergeProgressWithCanonical(canonicalNodes, rawProgress!.nodes ?? [])
    );
    const mastered = masteredSet(canonicalNodes, progressByNode);

    const viewBases: Array<
      Omit<IPersonalRoadmapNodeView, 'chapterUrl' | 'bookId' | 'chapterId' | 'topicId' | 'testId'> & {
        cn: ICanonicalRoadmapNode;
      }
    > = canonicalNodes.map((cn) => {
      const p = progressByNode.get(cn.nodeId)!;
      const availability = availabilityForNode(cn, mastered);
      const lowScoreFailCount = p.lowScoreFailCount ?? 0;
      return {
        cn,
        nodeId: cn.nodeId,
        title: cn.title,
        ...(cn.description?.trim() ? { description: cn.description.trim() } : {}),
        prerequisites: cn.prerequisites || [],
        metadata: cn.metadata,
        availability,
        mastered: p.mastered,
        lowScoreFailCount,
        knowledgeMapTestBlocked:
          lowScoreFailCount >= ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK,
        isRecommended: false,
        recommendedPriority: 0,
        recommendedReason: ''
      };
    });

    const frontier: Array<{
      node: ICanonicalRoadmapNode;
      p: IUserRoadmapNodeProgress;
      unlocks: number;
    }> = [];

    for (const cn of canonicalNodes) {
      const p = progressByNode.get(cn.nodeId)!;
      const av = availabilityForNode(cn, mastered);
      if (av !== 'available') continue;
      if (p.mastered) continue;
      const unlocks = unlocksCount(cn.nodeId, canonicalNodes, mastered);
      frontier.push({ node: cn, p, unlocks });
    }

    frontier.sort((a, b) => compareFrontier(a, b));

    const ranked = frontier.map((f, idx) => ({
      ...f,
      priority: idx + 1,
      reason: reasonForNode(f.p, f.unlocks, idx === 0)
    }));

    const top = ranked.slice(0, ROADMAP_TOP_K_RECOMMENDATIONS);
    const topIds = new Set(top.map((t) => t.node.nodeId));

    for (const vb of viewBases) {
      const r = ranked.find((x) => x.node.nodeId === vb.nodeId);
      if (r && topIds.has(vb.nodeId)) {
        vb.isRecommended = true;
        vb.recommendedPriority = r.priority;
        vb.recommendedReason = r.reason;
      }
    }

    let nextRecommended: INextRecommended | null = null;
    if (ranked.length > 0) {
      const first = ranked[0];
      nextRecommended = {
        nodeId: first.node.nodeId,
        reason: first.reason,
        priority: first.priority
      };
    }

    const views: IPersonalRoadmapNodeView[] = await Promise.all(
      viewBases.map(async (vb) => {
        const { cn, ...rest } = vb;
        return this.enrichPersonalNodeView(subjectId, cn, rest);
      })
    );

    const base: {
      version: number;
      subjectId: string;
      nodes: IPersonalRoadmapNodeView[];
      nextRecommended: INextRecommended | null;
      topRecommendations: Array<{
        nodeId: string;
        title: string;
        reason: string;
        priority: number;
      }>;
      ai?: { coachSummary: string; nextStepExplanation?: string };
    } = {
      version: bundle.version,
      subjectId,
      nodes: views,
      nextRecommended,
      topRecommendations: top.map((t) => ({
        nodeId: t.node.nodeId,
        title: t.node.title,
        reason: t.reason,
        priority: t.priority
      }))
    };

    if (!options?.includeAiInsights || !process.env.OPENAI_API_KEY) {
      return base;
    }

    try {
      const userDoc = await User.findById(userId).lean();
      const history = (userDoc?.testHistory || []).filter(
        (h: { subjectId?: unknown }) => String(h.subjectId) === String(subjectId)
      );

      const testHistorySummary = history.slice(-20).map((h: any) => ({
        scorePercent: h.result?.scorePercent ?? 0,
        correctAnswers: h.result?.correctAnswers ?? 0,
        totalQuestions: h.result?.totalQuestions ?? 0,
        createdAt: h.createdAt ? new Date(h.createdAt).toISOString() : undefined,
        mistakesCount: Array.isArray(h.aiFeedback?.mistakes) ? h.aiFeedback.mistakes.length : 0
      }));

      const nodesSummary = base.nodes.map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        availability: n.availability,
        mastered: n.mastered,
        bestScore: progressByNode.get(n.nodeId)?.bestScore ?? 0
      }));

      const ai = await roadmapAIService.enrichPersonalRoadmap({
        subjectTitle: subject.title,
        nodesSummary,
        nextRecommended: base.nextRecommended,
        testHistorySummary
      });

      const nodesWithHints = base.nodes.map((n) => ({
        ...n,
        ...(ai.nodeHints?.[n.nodeId] ? { aiHint: ai.nodeHints[n.nodeId] } : {})
      }));

      let nr = base.nextRecommended;
      if (nr && ai.nextStepExplanation?.trim()) {
        nr = {
          ...nr,
          reason: `${nr.reason}. ${ai.nextStepExplanation.trim()}`
        };
      }

      return {
        ...base,
        nodes: nodesWithHints,
        nextRecommended: nr,
        ai: {
          coachSummary: ai.coachSummary,
          ...(ai.nextStepExplanation ? { nextStepExplanation: ai.nextStepExplanation } : {})
        }
      };
    } catch (e) {
      console.warn('[roadmap] personal AI layer failed', e);
      return base;
    }
  }

  async getNext(
    userId: string,
    subjectId: string,
    options?: { includeAiInsights?: boolean }
  ) {
    const snap = await this.getPersonalSnapshot(userId, subjectId, options);
    return {
      nextRecommended: snap.nextRecommended,
      alternatives: snap.topRecommendations.slice(1),
      ...(snap.ai ? { ai: snap.ai } : {})
    };
  }

  async getPickerSubjects(userId: string): Promise<IRoadmapPickerSubjectItem[]> {
    const user = await User.findById(userId)
      .populate({
        path: 'profileSubjectPairId',
        populate: [
          { path: 'subject1Id', select: 'title description subjectKind' },
          { path: 'subject2Id', select: 'title description subjectKind' }
        ]
      })
      .lean();

    const pair = user?.profileSubjectPairId as
      | {
          subject1Id?: { _id?: mongoose.Types.ObjectId; title?: string; description?: string };
          subject2Id?: { _id?: mongoose.Types.ObjectId; title?: string; description?: string };
        }
      | null
      | undefined;

    if (!pair || !pair.subject1Id || !pair.subject2Id) {
      return [];
    }

    const list = [pair.subject1Id, pair.subject2Id];
    const out: IRoadmapPickerSubjectItem[] = [];

    for (const subj of list) {
      const sid = subj._id?.toString();
      if (!sid) continue;
      const title = (subj.title as string) || '';
      const subtitle =
        typeof subj.description === 'string' && subj.description.trim() ? subj.description.trim() : undefined;

      let bundle: CanonicalBundle;
      try {
        bundle = await this.resolveCanonical(sid);
      } catch {
        out.push({
          subjectId: sid,
          title,
          ...(subtitle ? { subtitle } : {}),
          roadmapConfigured: false,
          isRoadmapAvailable: false,
          progressPercent: 0,
          progressStatus: 'not_started',
          nodesTotal: 0,
          nodesMastered: 0
        });
        continue;
      }

      if (bundle.nodes.length === 0) {
        out.push({
          subjectId: sid,
          title,
          ...(subtitle ? { subtitle } : {}),
          roadmapConfigured: false,
          isRoadmapAvailable: false,
          progressPercent: 0,
          progressStatus: 'not_started',
          nodesTotal: 0,
          nodesMastered: 0
        });
        continue;
      }

      const snap = await this.getPersonalSnapshot(userId, sid, { includeAiInsights: false });
      const nodes = snap.nodes;
      const total = nodes.length;
      const masteredCount = nodes.filter((n) => n.mastered).length;
      const progressPercent = total ? Math.round((masteredCount / total) * 100) : 0;

      const rawProg = await UserRoadmapProgress.findOne({ userId, subjectId: sid }).lean();
      const stored = (rawProg?.nodes ?? []).map((x) => normalizeStoredNodeProgress(x));
      const hasAttempts = stored.some((n) => n.bestScore > 0);

      let progressStatus: 'not_started' | 'in_progress' | 'completed';
      if (total > 0 && masteredCount === total) {
        progressStatus = 'completed';
      } else if (masteredCount > 0 || hasAttempts) {
        progressStatus = 'in_progress';
      } else {
        progressStatus = 'not_started';
      }

      out.push({
        subjectId: sid,
        title,
        ...(subtitle ? { subtitle } : {}),
        roadmapConfigured: true,
        isRoadmapAvailable: true,
        progressPercent,
        progressStatus,
        nodesTotal: total,
        nodesMastered: masteredCount
      });
    }

    return out;
  }

  /**
   * Пробное тестирование: отметить освоение узлов (тема = nodeId book:chapter:topic) при балле ≥ порога пробника.
   */
  async applyTrialChapterResults(
    userId: string,
    results: Array<{ subjectId: string; nodeId: string; scorePercent: number }>
  ): Promise<{ updatedNodeIds: string[] }> {
    const updatedNodeIds: string[] = [];
    for (const r of results) {
      if (!mongoose.isValidObjectId(r.subjectId)) continue;
      if (!isMasteredByTrialScore(r.scorePercent)) continue;

      const bundle = await this.resolveCanonical(r.subjectId);
      if (!bundle.nodes.some((n) => n.nodeId === r.nodeId)) continue;

      const existingProgress = await UserRoadmapProgress.findOne({
        userId,
        subjectId: r.subjectId
      }).lean();
      const merged = this.mergeProgressWithCanonical(bundle.nodes, existingProgress?.nodes ?? []);
      const pMap = progressMap(merged);
      const cur = pMap.get(r.nodeId) ?? defaultProgress(r.nodeId);
      const bestScore = Math.max(cur.bestScore, r.scorePercent);
      const mastered =
        cur.mastered || isMasteredByTrialScore(r.scorePercent) || isMasteredByBestScore(bestScore);
      const updated: IUserRoadmapNodeProgress = { ...cur, nodeId: r.nodeId, bestScore, mastered };

      const finalNodes = merged.filter((n) => n.nodeId !== r.nodeId);
      finalNodes.push(updated);
      const orderedNodes = this.mergeProgressWithCanonical(bundle.nodes, finalNodes);

      await UserRoadmapProgress.findOneAndUpdate(
        { userId, subjectId: r.subjectId },
        {
          $set: { canonicalVersion: bundle.version, nodes: orderedNodes },
          $setOnInsert: { userId, subjectId: r.subjectId }
        },
        { upsert: true, new: true }
      );
      updatedNodeIds.push(r.nodeId);
    }
    return { updatedNodeIds };
  }

  async recordTestSubmitted(input: {
    userId: string;
    subjectId: string;
    nodeId: string;
    scorePercent: number;
    sessionId: string;
    submittedAt: Date;
  }) {
    const { userId, subjectId, nodeId, scorePercent, sessionId, submittedAt } = input;

    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    if (!sessionId?.trim()) throw AppError.badRequest('sessionId is required');

    const bundle = await this.resolveCanonical(subjectId);
    const nodeExists = bundle.nodes.some((n) => n.nodeId === nodeId);
    if (!nodeExists) throw AppError.badRequest('Unknown nodeId for this subject');

    const existingAttempt = await RoadmapAttempt.findOne({ userId, sessionId });
    if (existingAttempt) {
      const snap = await this.getPersonalSnapshot(userId, subjectId);
      return {
        idempotent: true as const,
        updatedNodesDelta: [] as { nodeId: string; mastered: boolean }[],
        nextRecommended: snap.nextRecommended,
        topRecommendations: snap.topRecommendations
      };
    }

    try {
      await RoadmapAttempt.create({
        userId,
        sessionId,
        subjectId,
        nodeId,
        scorePercent,
        submittedAt
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        const snap = await this.getPersonalSnapshot(userId, subjectId);
        return {
          idempotent: true as const,
          updatedNodesDelta: [] as { nodeId: string; mastered: boolean }[],
          nextRecommended: snap.nextRecommended,
          topRecommendations: snap.topRecommendations
        };
      }
      throw err;
    }

    const canonicalNodes = bundle.nodes;
    const existingProgress = await UserRoadmapProgress.findOne({ userId, subjectId }).lean();
    const merged = this.mergeProgressWithCanonical(canonicalNodes, existingProgress?.nodes ?? []);

    const pMap = progressMap(merged);
    const cur = pMap.get(nodeId) ?? defaultProgress(nodeId);
    const bestScore = Math.max(cur.bestScore, scorePercent);
    const mastered = cur.mastered || isMasteredByBestScore(bestScore);
    const prevFail = cur.lowScoreFailCount ?? 0;
    const lowScoreFailCount =
      scorePercent >= ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT
        ? 0
        : Math.min(ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK, prevFail + 1);

    const updated: IUserRoadmapNodeProgress = {
      ...cur,
      nodeId,
      bestScore,
      mastered,
      lowScoreFailCount
    };

    const finalNodes = merged.filter((n) => n.nodeId !== nodeId);
    finalNodes.push(updated);
    const orderedNodes = this.mergeProgressWithCanonical(canonicalNodes, finalNodes);

    await UserRoadmapProgress.findOneAndUpdate(
      { userId, subjectId },
      {
        $set: {
          canonicalVersion: bundle.version,
          nodes: orderedNodes
        },
        $setOnInsert: { userId, subjectId }
      },
      { upsert: true, new: true }
    ).lean();

    const snap = await this.getPersonalSnapshot(userId, subjectId);
    const delta = [
      { nodeId, mastered: snap.nodes.find((n) => n.nodeId === nodeId)!.mastered }
    ];

    return {
      idempotent: false as const,
      updatedNodesDelta: delta,
      nextRecommended: snap.nextRecommended,
      topRecommendations: snap.topRecommendations
    };
  }

  async markLessonRead(userId: string, subjectId: string, nodeId: string): Promise<{ readCompletedAt: string }> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    if (!nodeId?.trim()) throw AppError.badRequest('nodeId is required');

    const bundle = await this.resolveCanonical(subjectId);
    if (!bundle.nodes.some((n) => n.nodeId === nodeId)) {
      throw AppError.badRequest('Unknown nodeId for this subject');
    }

    const canonicalNodes = bundle.nodes;
    const rawProgress = await UserRoadmapProgress.findOne({ userId, subjectId }).lean();
    const merged = this.mergeProgressWithCanonical(canonicalNodes, rawProgress?.nodes ?? []);
    const map = progressMap(merged);
    const cur = map.get(nodeId) ?? defaultProgress(nodeId);
    const readAt = new Date();
    const updated: IUserRoadmapNodeProgress = { ...cur, nodeId, lessonReadAt: readAt };

    const finalNodes = merged.filter((n) => n.nodeId !== nodeId);
    finalNodes.push(updated);
    const orderedNodes = this.mergeProgressWithCanonical(canonicalNodes, finalNodes);

    await UserRoadmapProgress.findOneAndUpdate(
      { userId, subjectId },
      {
        $set: {
          canonicalVersion: bundle.version,
          nodes: orderedNodes
        },
        $setOnInsert: { userId, subjectId }
      },
      { upsert: true, new: true }
    );

    return { readCompletedAt: readAt.toISOString() };
  }

  /** Сброс счётчика неудачных попыток теста по узлу (кнопка «Освоил» на странице материала) */
  async acknowledgeMaterialMastery(
    userId: string,
    subjectId: string,
    nodeId: string
  ): Promise<{ lowScoreFailCount: number; knowledgeMapTestBlocked: boolean }> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    if (!nodeId?.trim()) throw AppError.badRequest('nodeId is required');

    const bundle = await this.resolveCanonical(subjectId);
    if (!bundle.nodes.some((n) => n.nodeId === nodeId)) {
      throw AppError.badRequest('Unknown nodeId for this subject');
    }

    const canonicalNodes = bundle.nodes;
    const rawProgress = await UserRoadmapProgress.findOne({ userId, subjectId }).lean();
    const merged = this.mergeProgressWithCanonical(canonicalNodes, rawProgress?.nodes ?? []);
    const map = progressMap(merged);
    const cur = map.get(nodeId) ?? defaultProgress(nodeId);
    const updated: IUserRoadmapNodeProgress = { ...cur, nodeId, lowScoreFailCount: 0 };

    const finalNodes = merged.filter((n) => n.nodeId !== nodeId);
    finalNodes.push(updated);
    const orderedNodes = this.mergeProgressWithCanonical(canonicalNodes, finalNodes);

    await UserRoadmapProgress.findOneAndUpdate(
      { userId, subjectId },
      {
        $set: {
          canonicalVersion: bundle.version,
          nodes: orderedNodes
        },
        $setOnInsert: { userId, subjectId }
      },
      { upsert: true, new: true }
    );

    return { lowScoreFailCount: 0, knowledgeMapTestBlocked: false };
  }

  async getLessonReadAtIso(userId: string, subjectId: string, nodeId: string): Promise<string | null> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const bundle = await this.resolveCanonical(subjectId);
    if (!bundle.nodes.some((n) => n.nodeId === nodeId)) {
      throw AppError.notFound('Roadmap node not found for this subject');
    }

    const rawProgress = await UserRoadmapProgress.findOne({ userId, subjectId }).lean();
    const merged = this.mergeProgressWithCanonical(bundle.nodes, rawProgress?.nodes ?? []);
    const p = progressMap(merged).get(nodeId);
    return p?.lessonReadAt?.toISOString() ?? null;
  }

  /**
   * Админ: сбросить сохранённую canonical-карту в БД и записать заново из актуальных тем (внутри глав) предмета.
   * Обновляет `updatedAt` предмета — версия карты для учеников пересчитывается при следующем запросе.
   */
  async adminRebuildCanonicalFromTopics(subjectId: string): Promise<{
    subjectId: string;
    version: number;
    nodesCount: number;
  }> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId).lean();
    if (!subject) throw AppError.notFound('Subject not found');

    const nodes = buildTopicCanonicalNodes(subject);
    if (nodes.length === 0) {
      throw AppError.badRequest(
        'Нет тем в книгах этого предмета — добавьте темы в главы, чтобы построить карту'
      );
    }
    assertValidCanonicalNodes(nodes);

    const subjectOid = new mongoose.Types.ObjectId(subjectId);
    await CanonicalRoadmap.deleteMany({ subjectId: subjectOid });

    const nextVersion = Math.max(1, Math.floor(Date.now() / 1000));

    await CanonicalRoadmap.findOneAndUpdate(
      { subjectId: subjectOid },
      {
        $set: {
          subjectId: subjectOid,
          version: nextVersion,
          nodes,
          description: 'Синхронизировано с темами учебника (админ)'
        },
        $unset: { sourceMeta: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Subject.findByIdAndUpdate(subjectId, { $set: { updatedAt: new Date() } });

    return { subjectId, version: nextVersion, nodesCount: nodes.length };
  }
}

export const roadmapService = new RoadmapService();
