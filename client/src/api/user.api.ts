import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import type { User } from '../types/auth.types';

export const userApi = {
  /** Сохранить пару по двум id предметов (должна существовать в разрешённых парах) или null / [] — сброс */
  async putProfileSubjects(subjectIds: [string, string] | null): Promise<User> {
    const body = { subjectIds };
    const { data } = await axiosInstance.put<ApiResponse<User & { _id?: string }>>(
      '/users/me/profile-subjects',
      body
    );
    const u = data.data;
    const id = u.id || u._id;
    return { ...u, id: id ?? '' };
  },

  /** @deprecated предпочтительнее putProfileSubjects */
  async setProfileSubjectPair(profileSubjectPairId: string | null): Promise<User> {
    const { data } = await axiosInstance.patch<ApiResponse<User & { _id?: string }>>(
      '/users/me/profile-subject-pair',
      { profileSubjectPairId }
    );
    const u = data.data;
    const id = u.id || u._id;
    return { ...u, id: id ?? '' };
  }
};
