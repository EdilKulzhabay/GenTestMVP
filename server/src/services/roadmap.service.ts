import fs from 'fs/promises';
import mongoose from 'mongoose';
import { CanonicalRoadmap } from '../models/CanonicalRoadmap.model';
import { UserRoadmapProgress } from '../models/UserRoadmapProgress.model';
import { RoadmapAttempt } from '../models/RoadmapAttempt.model';
import { Subject, User } from '../models';
import { roadmapAIService } from './roadmap.ai.service';
import { parseCanonicalNodesFromPayload } from '../utils/roadmapJson';
import { firstExistingCanonicalRoadmapFile } from '../utils/canonicalRoadmapPaths';
import { assertValidCanonicalNodes } from '../utils/roadmapGraph';
import {
  ICanonicalRoadmapNode,
  IPersonalRoadmapNodeView,
  IUserRoadmapNodeProgress,
  INextRecommended,
  RoadmapAvailability,
  RoadmapProgressStatus
} from '../types/roadmap.types';
import {
  ROADMAP_TOP_K_RECOMMENDATIONS,
  isMasteredByBestScore,
  scorePercentToMasteryScore,
  RecommendedReasonCode
} from '../roadmap/roadmap.rules';
import { AppError } from '../utils';

function defaultProgress(nodeId: string): IUserRoadmapNodeProgress {
  return {
    nodeId,
    attemptsCount: 0,
    bestScore: 0,
    avgScore: 0,
    sumScores: 0,
    masteryScore: 0,
    progressStatus: 'not_started'
  };
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
    if (p?.progressStatus === 'mastered') set.add(cn.nodeId);
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

/** Сколько узлов сейчас locked станет available, если добавить nodeId в mastered */
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
  if (p.progressStatus === 'in_progress') return 'CONTINUE_IN_PROGRESS';
  if (unlocks > 0) return 'UNLOCKS_NEXT_TOPICS';
  if (p.masteryScore < 0.5 && p.attemptsCount > 0) return 'LOW_MASTERY';
  if (isMainPath) return 'PART_OF_MAIN_PATH';
  return 'NOT_STARTED';
}

function compareFrontier(
  a: { node: ICanonicalRoadmapNode; p: IUserRoadmapNodeProgress; unlocks: number },
  b: { node: ICanonicalRoadmapNode; p: IUserRoadmapNodeProgress; unlocks: number }
): number {
  const aInProg = a.p.progressStatus === 'in_progress' ? 1 : 0;
  const bInProg = b.p.progressStatus === 'in_progress' ? 1 : 0;
  if (bInProg !== aInProg) return bInProg - aInProg;
  if (b.unlocks !== a.unlocks) return b.unlocks - a.unlocks;
  return a.p.masteryScore - b.p.masteryScore;
}

class RoadmapService {
  /**
   * Подхват canonical из MongoDB или из статичного JSON-файла (Notion: Sprint 0, JSON в репозитории).
   */
  private async loadCanonicalDocument(subjectId: string) {
    let doc = await CanonicalRoadmap.findOne({ subjectId }).sort({ version: -1 }).lean();
    if (doc) return doc;
    await this.trySeedCanonicalFromStaticFile(subjectId);
    doc = await CanonicalRoadmap.findOne({ subjectId }).sort({ version: -1 }).lean();
    return doc;
  }

  private async trySeedCanonicalFromStaticFile(subjectId: string): Promise<void> {
    const exists = await CanonicalRoadmap.findOne({ subjectId }).sort({ version: -1 }).lean();
    if (exists) return;

    const filePath = firstExistingCanonicalRoadmapFile(subjectId);
    if (!filePath) return;

    const text = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    const { nodes, version } = parseCanonicalNodesFromPayload(parsed);
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
            nodes
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

  async getCanonical(subjectId: string) {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId);
    if (!subject) throw AppError.notFound('Subject not found');

    const doc = await this.loadCanonicalDocument(subjectId);
    if (!doc) {
      throw AppError.notFound('Canonical roadmap not configured for this subject');
    }

    return {
      subjectId: doc.subjectId.toString(),
      version: doc.version,
      nodes: doc.nodes.map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        prerequisites: n.prerequisites || [],
        metadata: n.metadata
      })),
      ...(doc.sourceMeta ? { sourceMeta: doc.sourceMeta } : {})
    };
  }

  /**
   * Синхронизирует записи прогресса с узлами canonical (добавляет not_started для новых nodeId).
   */
  private mergeProgressWithCanonical(
    canonicalNodes: ICanonicalRoadmapNode[],
    existing: IUserRoadmapNodeProgress[]
  ): IUserRoadmapNodeProgress[] {
    const map = progressMap(existing);
    const out: IUserRoadmapNodeProgress[] = [];
    for (const cn of canonicalNodes) {
      out.push(map.get(cn.nodeId) ?? defaultProgress(cn.nodeId));
    }
    return out;
  }

  async getPersonalSnapshot(
    userId: string,
    subjectId: string,
    options?: { includeAiInsights?: boolean }
  ) {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId);
    if (!subject) throw AppError.notFound('Subject not found');

    const canonicalDoc = await this.loadCanonicalDocument(subjectId);
    if (!canonicalDoc) throw AppError.notFound('Canonical roadmap not configured for this subject');

    const canonicalNodes = canonicalDoc.nodes;
    let progressDoc = await UserRoadmapProgress.findOne({ userId, subjectId });

    if (!progressDoc) {
      const merged = this.mergeProgressWithCanonical(canonicalNodes, []);
      progressDoc = await UserRoadmapProgress.create({
        userId,
        subjectId,
        canonicalVersion: canonicalDoc.version,
        nodes: merged
      });
    } else {
      const merged = this.mergeProgressWithCanonical(canonicalNodes, progressDoc.nodes);
      if (merged.length !== progressDoc.nodes.length || progressDoc.canonicalVersion !== canonicalDoc.version) {
        progressDoc.nodes = merged;
        progressDoc.canonicalVersion = canonicalDoc.version;
        await progressDoc.save();
      }
    }

    const progressByNode = progressMap(progressDoc.nodes);
    const mastered = masteredSet(canonicalNodes, progressByNode);

    const views: IPersonalRoadmapNodeView[] = canonicalNodes.map((cn) => {
      const p = progressByNode.get(cn.nodeId)!;
      const availability = availabilityForNode(cn, mastered);
      return {
        nodeId: cn.nodeId,
        title: cn.title,
        prerequisites: cn.prerequisites || [],
        metadata: cn.metadata,
        availability,
        progressStatus: p.progressStatus,
        attemptsCount: p.attemptsCount,
        lastAttemptAt: p.lastAttemptAt?.toISOString(),
        bestScore: p.bestScore,
        avgScore: p.avgScore,
        masteryScore: p.masteryScore,
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
      if (p.progressStatus === 'mastered') continue;
      if (p.progressStatus !== 'not_started' && p.progressStatus !== 'in_progress') continue;
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

    for (const v of views) {
      const r = ranked.find((x) => x.node.nodeId === v.nodeId);
      if (r && topIds.has(v.nodeId)) {
        v.isRecommended = true;
        v.recommendedPriority = r.priority;
        v.recommendedReason = r.reason;
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
      version: canonicalDoc.version,
      subjectId: subjectId,
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
        progressStatus: n.progressStatus,
        bestScore: n.bestScore,
        attemptsCount: n.attemptsCount
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

  /**
   * Идемпотентная запись попытки: повтор с тем же sessionId не меняет метрики.
   */
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

    const canonicalDoc = await this.loadCanonicalDocument(subjectId);
    if (!canonicalDoc) throw AppError.notFound('Canonical roadmap not configured');

    const nodeExists = canonicalDoc.nodes.some((n) => n.nodeId === nodeId);
    if (!nodeExists) throw AppError.badRequest('Unknown nodeId for this subject');

    const existingAttempt = await RoadmapAttempt.findOne({ userId, sessionId });
    if (existingAttempt) {
      const snap = await this.getPersonalSnapshot(userId, subjectId);
      return {
        idempotent: true as const,
        updatedNodesDelta: [] as { nodeId: string; progressStatus: RoadmapProgressStatus }[],
        nextRecommended: snap.nextRecommended,
        topRecommendations: snap.topRecommendations
      };
    }

    const session = await mongoose.startSession();
    try {
      try {
      await session.withTransaction(async () => {
        await RoadmapAttempt.create(
          [
            {
              userId,
              sessionId,
              subjectId,
              nodeId,
              scorePercent,
              submittedAt
            }
          ],
          { session }
        );

        let progressDoc = await UserRoadmapProgress.findOne({ userId, subjectId }).session(session);
        const canonicalNodes = canonicalDoc.nodes;
        if (!progressDoc) {
          const merged = this.mergeProgressWithCanonical(canonicalNodes, []);
          progressDoc = new UserRoadmapProgress({
            userId,
            subjectId,
            canonicalVersion: canonicalDoc.version,
            nodes: merged
          });
        } else {
          progressDoc.nodes = this.mergeProgressWithCanonical(canonicalNodes, progressDoc.nodes);
          progressDoc.canonicalVersion = canonicalDoc.version;
        }

        const map = progressMap(progressDoc.nodes);
        const cur = map.get(nodeId) ?? defaultProgress(nodeId);
        const attempts = cur.attemptsCount + 1;
        const sumScores = cur.sumScores + scorePercent;
        const avgScore = sumScores / attempts;
        const bestScore = Math.max(cur.bestScore, scorePercent);
        let progressStatus: RoadmapProgressStatus = 'in_progress';
        if (isMasteredByBestScore(bestScore)) {
          progressStatus = 'mastered';
        } else if (attempts > 0) {
          progressStatus = 'in_progress';
        }

        const updated: IUserRoadmapNodeProgress = {
          ...cur,
          attemptsCount: attempts,
          lastAttemptAt: submittedAt,
          bestScore,
          avgScore,
          sumScores,
          masteryScore: scorePercentToMasteryScore(bestScore),
          progressStatus
        };

        const nextNodes = progressDoc.nodes.filter((n) => n.nodeId !== nodeId);
        nextNodes.push(updated);
        progressDoc.nodes = this.mergeProgressWithCanonical(
          canonicalNodes,
          nextNodes
        );

        await progressDoc.save({ session });
      });
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code;
        if (code === 11000) {
          const snap = await this.getPersonalSnapshot(userId, subjectId);
          return {
            idempotent: true as const,
            updatedNodesDelta: [] as { nodeId: string; progressStatus: RoadmapProgressStatus }[],
            nextRecommended: snap.nextRecommended,
            topRecommendations: snap.topRecommendations
          };
        }
        throw err;
      }
    } finally {
      await session.endSession();
    }

    const snap = await this.getPersonalSnapshot(userId, subjectId);
    const delta = [{ nodeId, progressStatus: snap.nodes.find((n) => n.nodeId === nodeId)!.progressStatus }];

    return {
      idempotent: false as const,
      updatedNodesDelta: delta,
      nextRecommended: snap.nextRecommended,
      topRecommendations: snap.topRecommendations
    };
  }
}

export const roadmapService = new RoadmapService();
