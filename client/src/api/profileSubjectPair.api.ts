import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import type { ProfileSubjectPair } from '../types/profileSubjectPair.types';

export const profileSubjectPairApi = {
  async list(): Promise<ProfileSubjectPair[]> {
    const { data } = await axiosInstance.get<ApiResponse<ProfileSubjectPair[]>>('/profile-subject-pairs');
    return data.data;
  },

  async create(payload: { subject1Id: string; subject2Id: string }): Promise<ProfileSubjectPair> {
    const { data } = await axiosInstance.post<ApiResponse<ProfileSubjectPair>>('/profile-subject-pairs', payload);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await axiosInstance.delete(`/profile-subject-pairs/${id}`);
  }
};
