import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import {
  KtpCatalog,
  KtpTopicInput,
  KnowledgeComponent,
  KnowledgeComponentInput,
  BankCoverage,
  BankGenerateResult,
  BankItem,
  QuestionItemStatus
} from '../types/ktp.types';

export const ktpApi = {
  async getCatalog(subjectId: string): Promise<KtpCatalog | null> {
    const { data } = await axiosInstance.get<ApiResponse<KtpCatalog | null>>(`/ktp/${subjectId}`);
    return data.data;
  },

  async upsertMeta(subjectId: string, body: { year?: number; version?: number }): Promise<KtpCatalog> {
    const { data } = await axiosInstance.post<ApiResponse<KtpCatalog>>(`/ktp/${subjectId}`, body);
    return data.data;
  },

  async addTopic(subjectId: string, body: KtpTopicInput): Promise<KtpCatalog> {
    const { data } = await axiosInstance.post<ApiResponse<KtpCatalog>>(`/ktp/${subjectId}/topics`, body);
    return data.data;
  },

  async updateTopic(
    subjectId: string,
    topicId: string,
    body: Partial<KtpTopicInput>
  ): Promise<KtpCatalog> {
    const { data } = await axiosInstance.patch<ApiResponse<KtpCatalog>>(
      `/ktp/${subjectId}/topics/${topicId}`,
      body
    );
    return data.data;
  },

  async deleteTopic(subjectId: string, topicId: string): Promise<KtpCatalog> {
    const { data } = await axiosInstance.delete<ApiResponse<KtpCatalog>>(
      `/ktp/${subjectId}/topics/${topicId}`
    );
    return data.data;
  },

  async reorder(subjectId: string, orderedTopicIds: string[]): Promise<KtpCatalog> {
    const { data } = await axiosInstance.post<ApiResponse<KtpCatalog>>(`/ktp/${subjectId}/reorder`, {
      orderedTopicIds
    });
    return data.data;
  },

  async import(
    subjectId: string,
    body: { topics: KtpTopicInput[]; year?: number; version?: number; replace?: boolean }
  ): Promise<KtpCatalog> {
    const { data } = await axiosInstance.post<ApiResponse<KtpCatalog>>(`/ktp/${subjectId}/import`, body);
    return data.data;
  },

  // ==================== Knowledge Components (подтемы) ====================
  // Все мутации — только admin (бэкенд isAdmin); чтение list/coverage — teacher+admin.

  async listComponents(subjectId: string, topicId: string): Promise<KnowledgeComponent[]> {
    const { data } = await axiosInstance.get<ApiResponse<KnowledgeComponent[]>>(
      `/ktp/${subjectId}/topics/${topicId}/components`
    );
    return data.data;
  },

  async proposeComponents(subjectId: string, topicId: string): Promise<KnowledgeComponent[]> {
    const { data } = await axiosInstance.post<ApiResponse<KnowledgeComponent[]>>(
      `/ktp/${subjectId}/topics/${topicId}/components/propose`
    );
    return data.data;
  },

  async upsertComponent(
    subjectId: string,
    topicId: string,
    body: KnowledgeComponentInput
  ): Promise<KnowledgeComponent[]> {
    const { data } = await axiosInstance.post<ApiResponse<KnowledgeComponent[]>>(
      `/ktp/${subjectId}/topics/${topicId}/components`,
      body
    );
    return data.data;
  },

  async confirmComponents(subjectId: string, topicId: string, kcIds: string[]): Promise<KnowledgeComponent[]> {
    const { data } = await axiosInstance.post<ApiResponse<KnowledgeComponent[]>>(
      `/ktp/${subjectId}/topics/${topicId}/components/confirm`,
      { kcIds }
    );
    return data.data;
  },

  async reorderComponents(
    subjectId: string,
    topicId: string,
    orderedKcIds: string[]
  ): Promise<KnowledgeComponent[]> {
    const { data } = await axiosInstance.post<ApiResponse<KnowledgeComponent[]>>(
      `/ktp/${subjectId}/topics/${topicId}/components/reorder`,
      { orderedKcIds }
    );
    return data.data;
  },

  async deleteComponent(subjectId: string, topicId: string, kcId: string): Promise<KnowledgeComponent[]> {
    const { data } = await axiosInstance.delete<ApiResponse<KnowledgeComponent[]>>(
      `/ktp/${subjectId}/topics/${topicId}/components/${kcId}`
    );
    return data.data;
  },

  // ==================== Question Bank (банк вопросов) ====================

  async bankCoverage(subjectId: string, topicId: string): Promise<BankCoverage> {
    const { data } = await axiosInstance.get<ApiResponse<BankCoverage>>(
      `/ktp/${subjectId}/topics/${topicId}/bank/coverage`
    );
    return data.data;
  },

  async bankGenerate(
    subjectId: string,
    topicId: string,
    body: { minPerKc?: number; difficulty?: number }
  ): Promise<BankGenerateResult> {
    const { data } = await axiosInstance.post<ApiResponse<BankGenerateResult>>(
      `/ktp/${subjectId}/topics/${topicId}/bank/generate`,
      body
    );
    return data.data;
  },

  async bankItems(
    subjectId: string,
    topicId: string,
    params?: { kcId?: string; status?: QuestionItemStatus }
  ): Promise<BankItem[]> {
    const { data } = await axiosInstance.get<ApiResponse<BankItem[]>>(
      `/ktp/${subjectId}/topics/${topicId}/bank/items`,
      { params }
    );
    return data.data;
  }
};
