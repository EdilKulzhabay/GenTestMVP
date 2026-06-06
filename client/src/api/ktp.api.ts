import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import { KtpCatalog, KtpTopicInput } from '../types/ktp.types';

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
  }
};
