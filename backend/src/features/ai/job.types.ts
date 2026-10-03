export type JobState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface IntelligenceJob {
  id: string;
  workspace_id: string;
  actor_id: string;
  feature: string;
  state: JobState;
  stage: string;
  progress: number | null;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_code: string | null;
}

export interface JobView {
  id: string;
  feature: string;
  state: JobState;
  stage: string;
  progress?: number;
  result?: Record<string, unknown>;
  errorCode?: string;
}

export interface JobEnvelope {
  jobId: string;
  actorId: string;
  workspaceId: string;
}

export type IntelligenceJobHandler = (job: IntelligenceJob) => Promise<Record<string, unknown>>;

export function toJobView(job: IntelligenceJob): JobView {
  return {
    id: job.id,
    feature: job.feature,
    state: job.state,
    stage: job.stage,
    ...(job.progress === null ? {} : { progress: job.progress }),
    ...(job.result ? { result: job.result } : {}),
    ...(job.error_code ? { errorCode: job.error_code } : {}),
  };
}
