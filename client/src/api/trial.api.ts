import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import type { TrialStep, TrialResultRow, TrialTopicMasteryRow, PendingTrialMergePayload } from '../utils/trialSession';

export interface TrialConfigResponse {
  mainSubjects: Array<{ _id: string; title: string }>;
  profileSubjects: Array<{ _id: string; title: string }>;
  pairedProfileIds: string[] | null;
  /** В БД есть три обязательных предмета ВНО по точным названиям */
  trialMainsOk?: boolean;
  entTrialInfo?: {
    mainBlocks: Array<{ questionCount: number; blockLabel: string }>;
    profileBlockPoints: number;
    profileBlockQuestions: number;
  };
}

export interface TrialPlanResponse {
  steps: TrialStep[];
}

export const trialApi = {
  async getConfig(): Promise<TrialConfigResponse> {
    const { data } = await axiosInstance.get<ApiResponse<TrialConfigResponse>>('/trial/config');
    return data.data;
  },

  async postPlan(profileSubjectIds: string[]): Promise<TrialPlanResponse> {
    const { data } = await axiosInstance.post<ApiResponse<TrialPlanResponse>>('/trial/plan', {
      profileSubjectIds
    });
    return data.data;
  },

  async applyResults(
    results: Array<{ subjectId: string; nodeId: string; scorePercent: number }>
  ): Promise<{ updatedNodeIds: string[] }> {
    const { data } = await axiosInstance.post<ApiResponse<{ updatedNodeIds: string[] }>>(
      '/trial/apply-results',
      { results }
    );
    return data.data;
  },

  /** Слияние сохранённых гостевых результатов после входа (темы ≥ 80%, либо устар. только баллы по блоку) */
  async mergePendingIfAny(pending: PendingTrialMergePayload | TrialResultRow[]): Promise<void> {
    if (Array.isArray(pending)) {
      if (!pending.length) return;
      await this.applyResults(
        pending.map((r) => ({ subjectId: r.subjectId, nodeId: r.nodeId, scorePercent: r.scorePercent }))
      );
      return;
    }
    const rows: TrialTopicMasteryRow[] = pending.topicMasteryRows?.length
      ? pending.topicMasteryRows
      : pending.results.map((r) => ({
          subjectId: r.subjectId,
          nodeId: r.nodeId,
          scorePercent: r.scorePercent
        }));
    if (!rows.length) return;
    await this.applyResults(rows);
  }
};
