import { z } from 'zod';
import type { PublicOperation } from '../contracts/openapi';
import { aiConnectionViewSchema, aiModelsViewSchema, aiPreferenceInputSchema, apiKeyInputSchema, connectionPatchSchema, newApiKeyInputSchema } from './ai/ai.dto';
import { exportPublicOperations } from './exports/export.dto';
import {
  assessmentCopyInputSchema, assessmentGenerationInputSchema, assessmentInputSchema,
  assessmentPatchSchema, assessmentQuestionsInputSchema, blueprintInputSchema, blueprintPublicationSchema,
} from './assessments/assessments.dto';
import { conversationInputSchema, messageInputSchema, practiceSubmissionSchema, studyArtifactInputSchema } from './study/study.dto';

const uuid = z.string().uuid();
const looseObject = z.object({}).passthrough();
const job = z.object({ id: uuid, feature: z.string(), state: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']), stage: z.string() }).passthrough();
const jobEnvelope = z.object({ job });

export const intelligencePublicOperations: PublicOperation[] = [
  { method: 'get', path: '/ai/connections/ollama', operationId: 'getAIConnection', response: z.object({ connection: aiConnectionViewSchema.nullable() }).strict() },
  { method: 'put', path: '/ai/connections/ollama', operationId: 'saveAIConnection', body: apiKeyInputSchema },
  { method: 'delete', path: '/ai/connections/ollama', operationId: 'removeAIConnection', success: 204 },
  { method: 'post', path: '/ai/connections/ollama/checks', operationId: 'checkAIConnection', response: jobEnvelope, success: 202, idempotent: true },
  { method: 'get', path: '/ai/connections', operationId: 'listAIConnections', response: z.object({ items: z.array(aiConnectionViewSchema) }).strict() },
  { method: 'post', path: '/ai/connections', operationId: 'addAIConnection', body: newApiKeyInputSchema, response: z.object({ connection: aiConnectionViewSchema }).strict(), success: 201 },
  { method: 'patch', path: '/ai/connections/:id', operationId: 'updateAIConnection', body: connectionPatchSchema, response: z.object({ items: z.array(aiConnectionViewSchema) }).strict() },
  { method: 'delete', path: '/ai/connections/:id', operationId: 'removeAIConnectionById', success: 204 },
  { method: 'post', path: '/ai/connections/:id/checks', operationId: 'checkAIConnectionById', response: jobEnvelope, success: 202, idempotent: true },
  { method: 'post', path: '/ai/connections/:id/usage', operationId: 'refreshAIConnectionUsage', response: z.object({ connection: aiConnectionViewSchema }).strict() },
  { method: 'get', path: '/ai/models', operationId: 'listAIModels', response: aiModelsViewSchema },
  { method: 'put', path: '/ai/preferences', operationId: 'setAIPreference', body: aiPreferenceInputSchema },

  { method: 'post', path: '/materials/:id/documents', operationId: 'uploadDocument', success: 202, multipart: true, idempotent: true },
  { method: 'get', path: '/materials/:id/documents', operationId: 'listMaterialDocuments' },
  { method: 'get', path: '/documents/:id', operationId: 'getDocument' },
  { method: 'get', path: '/documents/:id/content', operationId: 'downloadDocument', binary: true },
  { method: 'delete', path: '/documents/:id', operationId: 'deleteDocument', response: jobEnvelope, success: 202, idempotent: true },
  { method: 'post', path: '/documents/:id/reprocessing', operationId: 'reprocessDocument', response: jobEnvelope, success: 202, idempotent: true },
  { method: 'get', path: '/jobs/:id', operationId: 'getJob', response: z.object({ job }).strict() },

  { method: 'post', path: '/conversations', operationId: 'createConversation', body: conversationInputSchema },
  { method: 'get', path: '/conversations', operationId: 'listConversations' },
  { method: 'get', path: '/conversations/:id/messages', operationId: 'listConversationMessages' },
  { method: 'post', path: '/conversations/:id/messages', operationId: 'sendConversationMessage', body: messageInputSchema, response: jobEnvelope, success: 202, idempotent: true },
  { method: 'get', path: '/study/artifacts', operationId: 'listStudyArtifacts' },
  { method: 'post', path: '/study/artifacts', operationId: 'createStudyArtifact', body: studyArtifactInputSchema, response: jobEnvelope, success: 202, idempotent: true },
  { method: 'get', path: '/study/artifacts/:id', operationId: 'getStudyArtifact' },
  { method: 'get', path: '/practice-tests', operationId: 'listPracticeTests' },
  { method: 'get', path: '/practice-tests/:id', operationId: 'getPracticeTest' },
  { method: 'post', path: '/practice-tests/:id/attempts', operationId: 'startPracticeAttempt', response: looseObject, success: 201 },
  { method: 'post', path: '/practice-attempts/:id/submission', operationId: 'submitPracticeAttempt', body: practiceSubmissionSchema },

  { method: 'get', path: '/courses/:courseId/assessments', operationId: 'listAssessments' },
  { method: 'post', path: '/courses/:courseId/assessments', operationId: 'createAssessment', body: assessmentInputSchema },
  { method: 'get', path: '/assessments/:id', operationId: 'getAssessment' },
  { method: 'patch', path: '/assessments/:id', operationId: 'updateAssessment', body: assessmentPatchSchema },
  { method: 'put', path: '/assessments/:id/questions', operationId: 'replaceAssessmentQuestions', body: assessmentQuestionsInputSchema },
  { method: 'post', path: '/assessments/:id/generations', operationId: 'generateAssessmentQuestions', body: assessmentGenerationInputSchema, response: jobEnvelope, success: 202, idempotent: true },
  { method: 'post', path: '/assessments/:id/copies', operationId: 'copyAssessment', body: assessmentCopyInputSchema },
  { method: 'get', path: '/classes/:classId/study-blueprint', operationId: 'getStudyBlueprint' },
  { method: 'put', path: '/classes/:classId/study-blueprint', operationId: 'saveStudyBlueprint', body: blueprintInputSchema },
  { method: 'post', path: '/classes/:classId/study-blueprint/publications', operationId: 'publishStudyBlueprint', body: blueprintPublicationSchema },

  ...exportPublicOperations,
];
