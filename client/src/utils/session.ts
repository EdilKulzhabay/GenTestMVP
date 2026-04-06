import { GeneratedTest, SubmitTestResponse } from '../types/test.types';

const CURRENT_TEST_KEY = 'gen-test:current-test';
const CURRENT_ANSWERS_KEY = 'gen-test:current-answers';
const LAST_RESULT_KEY = 'gen-test:last-result';
export const PENDING_RESULT_RETURN_KEY = 'gen-test:pending-result-return';

export const saveCurrentTest = (test: GeneratedTest): void => {
  sessionStorage.setItem(CURRENT_TEST_KEY, JSON.stringify(test));
};

export const getCurrentTest = (): GeneratedTest | null => {
  const raw = sessionStorage.getItem(CURRENT_TEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GeneratedTest;
  } catch {
    return null;
  }
};

export const clearCurrentTest = (): void => {
  sessionStorage.removeItem(CURRENT_TEST_KEY);
  sessionStorage.removeItem(CURRENT_ANSWERS_KEY);
};

export const saveCurrentAnswers = (testId: string, answers: string[]): void => {
  sessionStorage.setItem(CURRENT_ANSWERS_KEY, JSON.stringify({ testId, answers }));
};

export const getCurrentAnswers = (testId: string): string[] | null => {
  const raw = sessionStorage.getItem(CURRENT_ANSWERS_KEY);
  if (!raw) return null;
  try {
    const { testId: savedId, answers } = JSON.parse(raw) as { testId: string; answers: string[] };
    return savedId === testId ? answers : null;
  } catch {
    return null;
  }
};

export const saveLastResult = (result: SubmitTestResponse): void => {
  sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
};

export const getLastResult = (): SubmitTestResponse | null => {
  const raw = sessionStorage.getItem(LAST_RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubmitTestResponse;
  } catch {
    return null;
  }
};

export const clearLastResult = (): void => {
  sessionStorage.removeItem(LAST_RESULT_KEY);
};

export const setPendingResultReturn = (returnUrl: string): void => {
  sessionStorage.setItem(PENDING_RESULT_RETURN_KEY, returnUrl);
};

export const getPendingResultReturn = (): string | null => {
  return sessionStorage.getItem(PENDING_RESULT_RETURN_KEY);
};

export const clearPendingResultReturn = (): void => {
  sessionStorage.removeItem(PENDING_RESULT_RETURN_KEY);
};

const ROADMAP_CONTEXT_KEY = 'gen-test:roadmap-context';

export interface RoadmapTestContext {
  subjectId: string;
  nodeId: string;
  nodeTitle: string;
  sessionId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
}

export const saveRoadmapContext = (ctx: RoadmapTestContext): void => {
  sessionStorage.setItem(ROADMAP_CONTEXT_KEY, JSON.stringify(ctx));
};

export const getRoadmapContext = (): RoadmapTestContext | null => {
  const raw = sessionStorage.getItem(ROADMAP_CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoadmapTestContext;
  } catch {
    return null;
  }
};

export const clearRoadmapContext = (): void => {
  sessionStorage.removeItem(ROADMAP_CONTEXT_KEY);
};

const GUEST_TEST_SUBMISSION_KEY = 'gen-test:guest-submission';

export interface GuestTestSubmission {
  testId: string;
  answers: { questionText: string; selectedOption: string }[];
}

export const saveGuestTestSubmission = (data: GuestTestSubmission): void => {
  sessionStorage.setItem(GUEST_TEST_SUBMISSION_KEY, JSON.stringify(data));
};

export const getGuestTestSubmission = (): GuestTestSubmission | null => {
  const raw = sessionStorage.getItem(GUEST_TEST_SUBMISSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestTestSubmission;
  } catch {
    return null;
  }
};

export const clearGuestTestSubmission = (): void => {
  sessionStorage.removeItem(GUEST_TEST_SUBMISSION_KEY);
};
