import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import { Subject } from '../types/subject.types';

export const subjectApi = {
  async getSubjects(options?: { subjectKind?: 'main' | 'profile' }): Promise<Subject[]> {
    const { data } = await axiosInstance.get<ApiResponse<Subject[]>>('/subjects', {
      params: options?.subjectKind ? { subjectKind: options.subjectKind } : undefined
    });
    return data.data;
  },

  async getSubjectById(id: string): Promise<Subject> {
    const { data } = await axiosInstance.get<ApiResponse<Subject>>(`/subjects/${id}`);
    return data.data;
  },

  async createSubject(payload: {
    title: string;
    description?: string;
    subjectKind?: 'main' | 'profile';
  }): Promise<Subject> {
    const { data } = await axiosInstance.post<ApiResponse<Subject>>('/subjects', payload);
    return data.data;
  },

  async importSubject(payload: Record<string, unknown>): Promise<{ subject: Subject; stats: { books: number; chapters: number; topics: number; paragraphs: number } }> {
    const { data } = await axiosInstance.post<ApiResponse<{ subject: Subject; stats: { books: number; chapters: number; topics: number; paragraphs: number } }>>('/subjects/import', payload);
    return data.data;
  },

  async createBook(
    subjectId: string,
    payload: { title: string; author?: string; contentLanguage?: string }
  ): Promise<Subject> {
    const { data } = await axiosInstance.post<ApiResponse<Subject>>(`/subjects/${subjectId}/books`, payload);
    return data.data;
  },

  async createChapter(
    subjectId: string,
    bookId: string,
    payload: { title: string; order: number }
  ): Promise<Subject> {
    const { data } = await axiosInstance.post<ApiResponse<Subject>>(
      `/subjects/books/${bookId}/chapters`,
      payload,
      { params: { subjectId } }
    );
    return data.data;
  },

  async createTopic(
    subjectId: string,
    bookId: string,
    chapterId: string,
    payload: { title: string }
  ): Promise<Subject> {
    const { data } = await axiosInstance.post<ApiResponse<Subject>>(
      `/subjects/chapters/${chapterId}/topics`,
      payload,
      { params: { subjectId, bookId } }
    );
    return data.data;
  },

  async createParagraph(
    subjectId: string,
    bookId: string,
    chapterId: string,
    topicId: string,
    payload: {
      order: number;
      content: {
        text: string;
        pages: number[];
        metadata: {
          keywords: string[];
          difficulty?: string;
          source?: string;
        };
      };
    }
  ): Promise<Subject> {
    const { data } = await axiosInstance.post<ApiResponse<Subject>>(
      `/subjects/topics/${topicId}/paragraphs`,
      payload,
      { params: { subjectId, bookId, chapterId } }
    );
    return data.data;
  },

  async updateSubject(id: string, payload: { title?: string; description?: string; subjectKind?: 'main' | 'profile' }): Promise<Subject> {
    const { data } = await axiosInstance.patch<ApiResponse<Subject>>(`/subjects/${id}`, payload);
    return data.data;
  },

  async deleteSubject(id: string): Promise<void> {
    await axiosInstance.delete(`/subjects/${id}`);
  },

  async updateBook(subjectId: string, bookId: string, payload: { title?: string; author?: string; contentLanguage?: string }): Promise<Subject> {
    const { data } = await axiosInstance.patch<ApiResponse<Subject>>(`/subjects/${subjectId}/books/${bookId}`, payload);
    return data.data;
  },

  async deleteBook(subjectId: string, bookId: string): Promise<void> {
    await axiosInstance.delete(`/subjects/${subjectId}/books/${bookId}`);
  },

  async updateChapter(subjectId: string, bookId: string, chapterId: string, payload: { title?: string; order?: number }): Promise<Subject> {
    const { data } = await axiosInstance.patch<ApiResponse<Subject>>(`/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}`, payload);
    return data.data;
  },

  async deleteChapter(subjectId: string, bookId: string, chapterId: string): Promise<void> {
    await axiosInstance.delete(`/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}`);
  },

  async updateTopic(subjectId: string, bookId: string, chapterId: string, topicId: string, payload: { title?: string }): Promise<Subject> {
    const { data } = await axiosInstance.patch<ApiResponse<Subject>>(`/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}/topics/${topicId}`, payload);
    return data.data;
  },

  async deleteTopic(subjectId: string, bookId: string, chapterId: string, topicId: string): Promise<void> {
    await axiosInstance.delete(`/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}/topics/${topicId}`);
  },

  async deleteParagraph(subjectId: string, bookId: string, chapterId: string, topicId: string, paragraphId: string): Promise<void> {
    await axiosInstance.delete(`/subjects/${subjectId}/books/${bookId}/chapters/${chapterId}/topics/${topicId}/paragraphs/${paragraphId}`);
  }
};
