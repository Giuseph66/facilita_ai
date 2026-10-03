export type Persona = "TEACHER" | "STUDENT" | string;

export type WorkspaceView = {
  id: string;
  name: string;
  type?: "PERSONAL" | "INSTITUTION" | string;
  roles: string[];
};

export type SessionView = {
  user: {
    id: string;
    name: string;
    email: string;
    defaultPersona: Persona;
  };
  workspaces: WorkspaceView[];
  csrfToken: string;
};

export function workspaceSupportsPersona(workspace: WorkspaceView | null | undefined, persona: Persona) {
  if (!workspace) return false;
  const roles = workspace.roles.map((role) => role.toUpperCase());
  return persona === "TEACHER"
    ? roles.some((role) => ["TEACHER", "PROFESSOR"].includes(role))
    : roles.some((role) => ["STUDENT", "ALUNO", "MEMBER"].includes(role));
}

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export type JobView = {
  id: string;
  feature: string;
  state: string;
  stage: string;
  progress?: number;
  result?: unknown;
  errorCode?: string;
};

export type CourseView = {
  id: string;
  workspaceId: string;
  ownerUserId?: string;
  owner?: { id: string; name: string };
  title: string;
  description?: string | null;
  revision: number;
  topics?: string[];
  topicItems?: Array<{ id: string; title: string; position: number }>;
  objectives?: string[];
  archivedAt?: string | null;
  classes?: ClassView[];
};

export type TopicView = {
  id?: string;
  title: string;
  description?: string;
  objectives?: string[];
  position?: number;
};

export type ClassView = {
  id: string;
  workspaceId?: string;
  courseId: string;
  teacherUserId?: string;
  name: string;
  period?: string;
  studentCount?: number | null;
  revision?: number;
};

export type MaterialView = {
  id: string;
  courseId: string;
  title: string;
  kind: string;
  classification: string;
  revision: number;
  documents?: DocumentView[];
  documentsNextCursor?: string | null;
  releases?: Array<{ classId: string; releasedAt?: string | null; revokedAt?: string | null }>;
};

export type DocumentView = {
  id: string;
  name: string;
  sizeBytes?: string;
  format?: string;
  status: string;
  stage?: string;
  errorCode?: string;
  activeVersionId?: string;
  createdAt?: string;
};

export type AssessmentView = {
  id: string;
  title: string;
  kind?: "QUIZ" | "EXAM" | "ASSIGNMENT" | string;
  type?: string;
  state: string;
  revision: number;
  questions?: AssessmentQuestionView[];
  courseId?: string;
};

export type AssessmentQuestionView = {
  id?: string;
  type: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "ESSAY" | string;
  statement: string;
  options?: Array<{ id: string; text: string }>;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | string;
  points?: number;
  answer?: { correctOptionId?: string; expectedAnswer?: string; rubric?: string };
};

export type ConversationMessage = {
  id: string;
  clientMessageId?: string | null;
  role: "user" | "assistant" | "USER" | "ASSISTANT";
  content: string;
  createdAt?: string;
  citations?: CitationView[];
};

export type ConversationView = {
  id: string;
  kind: string;
  title?: string;
  courseId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type StudyArtifactView = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  sources: Array<{ documentId: string; documentName: string; pageNumber?: number }>;
  createdAt?: string;
};

export type OllamaConnectionView = {
  provider: string;
  status: string;
  maskedKey?: string;
  checkedAt?: string | null;
};

export type EntitlementsView = {
  plan?: { code: string; name: string; catalogVersion: string; periodEnd?: string | null };
  capabilities?: Record<string, boolean | number | string | Record<string, unknown> | null>;
  limits?: Record<string, { limit: number | string | null; period: string | null }>;
  platformAiEnabled?: boolean;
};

export type PrivacyRequestView = {
  id: string;
  type: "EXPORT" | "DELETE_ACCOUNT" | string;
  state: string;
  requestedAt: string;
  downloadUrl?: string | null;
  expiresAt?: string | null;
  completedAt?: string | null;
  errorCode?: string | null;
};

export type CitationView = {
  documentId?: string;
  materialId?: string;
  title?: string;
  page?: number;
  slide?: number;
  excerpt?: string;
};

export type ApiErrorBody = {
  code: string;
  message?: string;
  details?: unknown;
  requestId?: string;
};

export type PlanView = {
  code: string;
  name: string;
  catalogVersion: string;
  capabilities: Record<string, { type: "BOOLEAN" | "LIMIT" | "CONFIG"; value: unknown }>;
  price: { amount: string; currency: string; interval: "month" | "year" } | null;
};

export type UsageView = {
  items?: Array<{ metric: string; period: string; periodStart: string; used: number | string; reserved: number | string; limit: number | string | null }>;
  nextCursor?: string | null;
};
