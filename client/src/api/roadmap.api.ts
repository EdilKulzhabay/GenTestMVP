import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import { GenerateTestRequest } from '../types/test.types';
import {
  CanonicalRoadmapResponse,
  PersonalRoadmapResponse,
  RoadmapPickerSubjectItem,
  RoadmapLessonResponse,
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

  /** Список предметов (из выбранной пары) с агрегатом прогресса, согласованным с getPersonal */
  async getPickerSubjects(): Promise<RoadmapPickerSubjectItem[]> {
    const { data } = await axiosInstance.get<ApiResponse<{ subjects: RoadmapPickerSubjectItem[] }>>(
      '/roadmaps/picker-subjects'
    );
    return data.data.subjects;
  },

  async getNodeLesson(nodeId: string, subjectId: string): Promise<RoadmapLessonResponse> {
    const { data } = await axiosInstance.get<ApiResponse<RoadmapLessonResponse>>(
      `/roadmaps/nodes/${encodeURIComponent(nodeId)}/lesson`,
      { params: { subjectId } }
    );
    return data.data;
  },

  async postNodeLessonRead(nodeId: string, subjectId: string): Promise<{ readCompletedAt: string }> {
    const { data } = await axiosInstance.post<ApiResponse<{ readCompletedAt: string }>>(
      `/roadmaps/nodes/${encodeURIComponent(nodeId)}/lesson/read`,
      { subjectId }
    );
    return data.data;
  },

  /** Сброс блокировки теста по узлу (три попытки ниже 80%) после кнопки «Освоил» */
  async acknowledgeNodeMaterial(
    nodeId: string,
    subjectId: string
  ): Promise<{ lowScoreFailCount: number; knowledgeMapTestBlocked: boolean }> {
    const { data } = await axiosInstance.post<
      ApiResponse<{ lowScoreFailCount: number; knowledgeMapTestBlocked: boolean }>
    >(`/roadmaps/nodes/${encodeURIComponent(nodeId)}/acknowledge-material`, { subjectId });
    return data.data;
  },

  async postNodeChatMessage(
    nodeId: string,
    body: { subjectId: string; text: string; attachmentIds?: string[] }
  ): Promise<{ reply: string }> {
    const { data } = await axiosInstance.post<ApiResponse<{ reply: string }>>(
      `/roadmaps/nodes/${encodeURIComponent(nodeId)}/chat/messages`,
      body
    );
    return data.data;
  },

  /**
   * Загрузка фото: multipart, поле file; subjectId в form или ?subjectId=.
   */
  async postNodeChatAttachment(
    nodeId: string,
    file: File,
    subjectId: string
  ): Promise<{ attachmentId: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('subjectId', subjectId);
    const { data } = await axiosInstance.post<ApiResponse<{ attachmentId: string }>>(
      `/roadmaps/nodes/${encodeURIComponent(nodeId)}/chat/attachments`,
      form
    );
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
  /** Админ: очистить сохранённую карту и заново построить из тем (внутри глав) предмета */
  async rebuildFromTopics(subjectId: string): Promise<{
    subjectId: string;
    version: number;
    nodesCount: number;
  }> {
    const { data } = await axiosInstance.post<
      ApiResponse<{ subjectId: string; version: number; nodesCount: number }>
    >('/roadmaps/admin/rebuild-from-topics', { subjectId });
    return data.data;
  },

  async upsertCanonical(body: {
    subjectId: string;
    version?: number;
    description?: string;
    nodes: Array<{
      nodeId: string;
      title: string;
      description?: string;
      prerequisites: string[];
      metadata?: Record<string, unknown>;
    }>;
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
