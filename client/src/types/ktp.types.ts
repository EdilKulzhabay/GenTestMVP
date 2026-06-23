export interface KtpTopic {
  _id: string;
  title: string;
  description?: string;
  order: number;
  /** Код темы от центра тестирования (отображение/импорт) */
  code?: string;
  prerequisiteKtpTopicIds?: string[];
}

export interface KtpCatalog {
  _id: string;
  subjectId: string;
  /** Год актуальности справочника ЦТ */
  year?: number;
  version: number;
  topics: KtpTopic[];
  createdAt?: string;
  updatedAt?: string;
}

export interface KtpTopicInput {
  title: string;
  description?: string;
  order?: number;
  code?: string;
}

// ==================== Knowledge Components (подтемы) + банк вопросов ====================

export type KnowledgeComponentStatus = 'proposed' | 'confirmed';

export interface KnowledgeComponent {
  _id: string;
  title: string;
  description?: string;
  order: number;
  status: KnowledgeComponentStatus;
}

export interface KnowledgeComponentInput {
  id?: string;
  title?: string;
  description?: string;
  order?: number;
  status?: KnowledgeComponentStatus;
}

export interface BankCoverageKc {
  kcId: string;
  title: string;
  active: number;
}

export interface BankCoverage {
  totalActive: number;
  perKc: BankCoverageKc[];
  unassigned: number;
}

export interface BankGenerateResult {
  created: number;
  rejected: number;
  coverage: BankCoverage;
}

export type QuestionItemStatus = 'draft' | 'active' | 'retired';

/** Item банка для admin-просмотра (с правильным ответом). */
export interface BankItem {
  _id: string;
  knowledgeNodeId: string;
  knowledgeComponentIds: string[];
  difficulty: number;
  status: QuestionItemStatus;
  question: {
    questionType: string;
    questionText: string;
    options?: string[];
    correctOption?: string;
    aiExplanation?: string;
  };
  qualityStats?: { timesUsed: number; timesCorrect: number };
  createdAt?: string;
}
