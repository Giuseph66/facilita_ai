import { z } from 'zod';
import type { PublicOperation } from '../../contracts/openapi';

export const exportInputSchema = z.object({
  revision: z.number().int().positive(),
  format: z.enum(['PDF', 'PRINT']).default('PDF'),
  variant: z.enum(['QUESTIONS', 'ANSWER_KEY']),
}).strict();
export type ExportInput = z.infer<typeof exportInputSchema>;

export const exportViewSchema = z.object({
  id: z.string().uuid(), assessmentId: z.string().uuid(), revision: z.number().int().positive(),
  format: z.enum(['PDF', 'PRINT']), variant: z.enum(['QUESTIONS', 'ANSWER_KEY']),
  status: z.enum(['QUEUED', 'READY', 'FAILED', 'EXPIRED']),
  expiresAt: z.string().datetime(), jobId: z.string().uuid(), downloadUrl: z.string().optional(),
}).strict();

export const exportPublicOperations: PublicOperation[] = [
  { method: 'post', path: '/assessments/:id/exports', operationId: 'createAssessmentExport', body: exportInputSchema, success: 202, idempotent: true },
  { method: 'get', path: '/exports/:id', operationId: 'getExport', response: z.object({ export: exportViewSchema }).strict() },
  { method: 'get', path: '/exports/:id/content', operationId: 'downloadExport', binary: true },
];
