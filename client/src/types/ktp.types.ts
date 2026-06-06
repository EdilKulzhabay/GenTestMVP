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
