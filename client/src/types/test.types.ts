export interface TestQuestion {
  questionText: string;
  options: string[];
}

export interface GeneratedTest {
  _id: string;
  subjectId: string;
  bookId: string;
  chapterId?: string;
  questions: TestQuestion[];
  createdAt: string;
}

export interface GenerateTestRequest {
  subjectId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
}

export interface SubmitAnswer {
  questionText: string;
  selectedOption: string;
}

export interface SubmitTestRequest {
  testId: string;
  answers: SubmitAnswer[];
}

export interface TestResultSummary {
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
}

export interface TestMistake {
  question: string;
  explanation: string;
  whereToRead: {
    bookTitle: string;
    chapterTitle: string;
    pages: number[];
  };
}

export interface AiFeedback {
  summary: string;
  mistakes: TestMistake[];
}

export interface SubmitTestResponse {
  testId: string;
  result: TestResultSummary;
  aiFeedback: AiFeedback;
  detailedAnswers: Array<{
    questionText: string;
    options: string[];
    correctOption: string;
    selectedOption: string;
    isCorrect: boolean;
    explanation?: string;
  }>;
}

export interface TestHistoryItem {
  _id: string;
  subjectId: { _id: string; title: string } | string;
  bookId: string;
  chapterId?: string;
  result: TestResultSummary;
  aiFeedback: AiFeedback;
  createdAt: string;
}
