import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import {
  GeneratedTest,
  GenerateTestRequest,
  SubmitTestRequest,
  SubmitTestResponse,
  TestHistoryItem
} from '../types/test.types';

export const testApi = {
  async generateTest(payload: GenerateTestRequest): Promise<GeneratedTest> {
    const { data } = await axiosInstance.post<ApiResponse<GeneratedTest>>('/tests/generate', payload);
    return data.data;
  },

  async submitTest(payload: SubmitTestRequest): Promise<SubmitTestResponse> {
    const { data } = await axiosInstance.post<ApiResponse<SubmitTestResponse>>('/tests/submit', payload);
    return data.data;
  },

  async generateTestGuest(payload: GenerateTestRequest): Promise<GeneratedTest> {
    const { data } = await axiosInstance.post<ApiResponse<GeneratedTest>>('/tests/generate-guest', payload);
    return data.data;
  },

  async submitTestGuest(payload: SubmitTestRequest): Promise<SubmitTestResponse> {
    const { data } = await axiosInstance.post<ApiResponse<SubmitTestResponse>>('/tests/submit-guest', payload);
    return data.data;
  },

  async claimGuestTest(payload: SubmitTestRequest): Promise<SubmitTestResponse> {
    const { data } = await axiosInstance.post<ApiResponse<SubmitTestResponse>>('/tests/claim-guest', payload);
    return data.data;
  },

  async getMyTests(): Promise<TestHistoryItem[]> {
    const { data } = await axiosInstance.get<ApiResponse<{ total: number; tests: TestHistoryItem[] }>>('/users/me/tests');
    return data.data.tests;
  },

  async getTestDetails(testHistoryId: string): Promise<TestHistoryItem> {
    const { data } = await axiosInstance.get<ApiResponse<TestHistoryItem>>(`/users/me/tests/${testHistoryId}`);
    return data.data;
  }
};
