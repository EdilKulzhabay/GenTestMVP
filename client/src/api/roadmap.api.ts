import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import { GenerateTestRequest } from '../types/test.types';
import {
  CanonicalRoadmapResponse,
  PersonalRoadmapResponse,
  RoadmapTestSubmittedResponse
} from '../types/roadmap.types';

export const roadmapApi = {
  async getCanonical(subjectId: string): Promise<CanonicalRoadmapResponse> {
    const { data } = await axiosInstance.get<ApiResponse<CanonicalRoadmapResponse>>('/roadmaps/canonical', {
      params: { subjectId }
    });
    return data.data;
  },

  async getPersonal(
    subjectId: string,
    options?: { includeAi?: boolean }
  ): Promise<PersonalRoadmapResponse> {
    const { data } = await axiosInstance.get<ApiResponse<PersonalRoadmapResponse>>('/roadmaps/personal', {
      params: { subjectId, ...(options?.includeAi ? { ai: '1' } : {}) }
    });
    return data.data;
  },

  async getNext(
    subjectId: string,
    options?: { includeAi?: boolean }
  ): Promise<{
    nextRecommended: PersonalRoadmapResponse['nextRecommended'];
    alternatives: PersonalRoadmapResponse['topRecommendations'];
    ai?: PersonalRoadmapResponse['ai'];
  }> {
    const { data } = await axiosInstance.get<
      ApiResponse<{
        nextRecommended: PersonalRoadmapResponse['nextRecommended'];
        alternatives: PersonalRoadmapResponse['topRecommendations'];
        ai?: PersonalRoadmapResponse['ai'];
      }>
    >('/roadmaps/next', { params: { subjectId, ...(options?.includeAi ? { ai: '1' } : {}) } });
    return data.data;
  },

  /**
   * Админ: сохранить статичный canonical roadmap (JSON), как в Notion — структура узлов вручную или из файла.
   * Тело: { subjectId, nodes[], version? } или целиком объект из файла с полями version + nodes.
   */
  async upsertCanonical(body: {
    subjectId: string;
    version?: number;
    nodes: CanonicalRoadmapResponse['nodes'];
  }): Promise<CanonicalRoadmapResponse> {
    const { data } = await axiosInstance.post<ApiResponse<CanonicalRoadmapResponse>>(
      '/roadmaps/admin/canonical',
      body
    );
    return data.data;
  },

  /** Опционально: черновик canonical по тексту книги через ИИ (вне основного процесса Notion). */
  async generateCanonicalFromBook(
    payload: GenerateTestRequest
  ): Promise<CanonicalRoadmapResponse & { source: string; bookId: string; chapterId?: string; fullBook?: boolean }> {
    const { data } = await axiosInstance.post<
      ApiResponse<
        CanonicalRoadmapResponse & {
          source: string;
          bookId: string;
          chapterId?: string;
          fullBook?: boolean;
        }
      >
    >('/roadmaps/admin/generate-canonical', payload);
    return data.data;
  },

  async postTestSubmitted(body: {
    subjectId: string;
    nodeId: string;
    score: number;
    sessionId: string;
    submittedAt?: string;
  }): Promise<RoadmapTestSubmittedResponse> {
    const { data } = await axiosInstance.post<ApiResponse<RoadmapTestSubmittedResponse>>(
      '/roadmaps/events/test-submitted',
      body
    );
    return data.data;
  }
};
