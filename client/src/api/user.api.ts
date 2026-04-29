import { axiosInstance } from './axios';
import type { ApiResponse } from '../types/api.types';
import type { User } from '../types/auth.types';

export const userApi = {
  /** Сохранить id пары из GET /profile-subject-pairs или null — сброс */
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
