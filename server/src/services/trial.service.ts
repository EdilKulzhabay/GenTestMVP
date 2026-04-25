import { Subject, User, ProfileSubjectPair } from '../models';
import { topicNodeId } from '../utils/roadmapChapter.util';
import { AppError } from '../utils';
/** Порядок и объём как в едином национальном тестировании (Казахстан) — в формате вопросов ЕНТ */
const MAIN_TRIAL_TITLES = [
  'История Казахстана',
  'Математическая грамотность',
  'Грамотность чтения'
] as const;

const MAIN_TRIAL_BLOCKS: Array<{
  questionCount: number;
  blockLabel: string;
}> = [
  { questionCount: 20, blockLabel: 'История Казахстана: 20 вопросов (20 баллов)' },
  { questionCount: 10, blockLabel: 'Математическая грамотность: 10 вопросов (10 баллов)' },
  { questionCount: 10, blockLabel: 'Грамотность чтения: 10 вопросов (10 баллов)' }
];

function assertSubjectNodeForTrial(subj: any, needTitle: string) {
  const book = subj.books?.[0];
  if (!book?._id) {
    throw AppError.badRequest(`У предмета «${needTitle}» нет учебника`);
  }
  const chapters = [...(book.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const chapter = chapters[0];
  if (!chapter?._id) {
    throw AppError.badRequest(`У предмета «${needTitle}» нет глав`);
  }
  const firstTopic = (chapter.topics || [])[0];
  if (!firstTopic?._id) {
    throw AppError.badRequest(
      `У предмета «${needTitle}» в первой главе нет тем — добавьте тему для привязки к карте знаний`
    );
  }
  const bid = book._id.toString();
  const cid = chapter._id.toString();
  const tid = firstTopic._id.toString();
  return {
    bookId: bid,
    chapterId: cid,
    nodeId: topicNodeId(bid, cid, tid),
    chapterTitle: chapter.title,
    topicTitle: firstTopic.title
  };
}

export class TrialService {
  async getConfig(userId?: string) {
    const mainSubjects = await Subject.find({ subjectKind: 'main' })
      .sort({ title: 1 })
      .select('_id title')
      .lean();

    const profileSubjects = await Subject.find({ subjectKind: 'profile' })
      .sort({ title: 1 })
      .select('_id title')
      .lean();

    let pairedProfileIds: string[] | null = null;
    if (userId) {
      const user = await User.findById(userId).select('profileSubjectPairId').lean();
      const pairId = user?.profileSubjectPairId;
      if (pairId) {
        const pair = await ProfileSubjectPair.findById(pairId).lean();
        if (pair) {
          pairedProfileIds = [pair.subject1Id.toString(), pair.subject2Id.toString()];
        }
      }
    }

    const trialMainsOk = await Promise.all(
      MAIN_TRIAL_TITLES.map((title) =>
        Subject.findOne({ subjectKind: 'main', title }).select('_id').lean()
      )
    ).then((docs) => docs.every((d) => d != null));

    return {
      mainSubjects,
      profileSubjects,
      pairedProfileIds,
      trialMainsOk,
      entTrialInfo: {
        mainBlocks: MAIN_TRIAL_BLOCKS,
        profileBlockPoints: 50,
        profileBlockQuestions: 40
      }
    };
  }

  async buildPlan(profileSubjectIds: string[]) {
    if (profileSubjectIds.length !== 2) {
      throw AppError.badRequest('Нужно выбрать ровно 2 профильных предмета');
    }
    const uniq = [...new Set(profileSubjectIds.map((id) => String(id).trim()))];
    if (uniq.length !== 2) {
      throw AppError.badRequest('Профильные предметы должны различаться');
    }

    const profiles = await Subject.find({
      _id: { $in: uniq },
      subjectKind: 'profile'
    }).lean();
    if (profiles.length !== 2) {
      throw AppError.badRequest('Указаны неверные профильные предметы');
    }

    const steps: Array<{
      subjectId: string;
      subjectTitle: string;
      bookId: string;
      chapterId: string;
      nodeId: string;
      chapterTitle: string;
      topicTitle: string;
      questionCount: number;
      trialBlockLabel: string;
      useFullBook: boolean;
    }> = [];

    for (let i = 0; i < MAIN_TRIAL_TITLES.length; i++) {
      const titleNeed = MAIN_TRIAL_TITLES[i];
      const subj = await Subject.findOne({
        subjectKind: 'main',
        title: titleNeed
      }).lean();
      if (!subj?._id) {
        throw AppError.badRequest(
          `В каталоге нет основного предмета «${titleNeed}» — импортируйте seed для пробного теста`
        );
      }
      const meta = assertSubjectNodeForTrial(subj, titleNeed);
      const blk = MAIN_TRIAL_BLOCKS[i];
      steps.push({
        subjectId: subj._id.toString(),
        subjectTitle: subj.title || titleNeed,
        bookId: meta.bookId,
        chapterId: meta.chapterId,
        nodeId: meta.nodeId,
        chapterTitle: meta.chapterTitle,
        topicTitle: meta.topicTitle,
        questionCount: blk.questionCount,
        trialBlockLabel: blk.blockLabel,
        useFullBook: true
      });
    }

    for (const subj of profiles) {
      const s = subj as any;
      const t = s.title || 'Предмет';
      const meta = assertSubjectNodeForTrial(s, t);
      steps.push({
        subjectId: s._id!.toString(),
        subjectTitle: t,
        bookId: meta.bookId,
        chapterId: meta.chapterId,
        nodeId: meta.nodeId,
        chapterTitle: meta.chapterTitle,
        topicTitle: meta.topicTitle,
        questionCount: 40,
        trialBlockLabel: `${t}: 40 вопросов (50 баллов)`,
        useFullBook: true
      });
    }

    return { steps };
  }
}

export const trialService = new TrialService();
