import { z } from 'zod';
import { fail } from '../../core/errors';

const title = z.string().trim().min(1).max(160);
const topicTitle = z.string().trim().min(1).max(240);
const uniqueStrings = <T extends z.ZodString>(item: T, max: number) =>
  z.array(item).max(max).superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((value, index) => {
      const key = value.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Valor duplicado.' });
      seen.add(key);
    });
  });

export const courseInputSchema = z.object({
  title,
  description: z.string().trim().max(4000).optional().default(''),
  topics: uniqueStrings(topicTitle, 50).optional().default([]),
  objectives: uniqueStrings(z.string().trim().min(1).max(500), 20).optional().default([]),
}).strict();
export type CourseInput = z.infer<typeof courseInputSchema>;

export const coursePatchSchema = z.object({
  revision: z.number().int().positive(),
  title: title.optional(),
  description: z.string().trim().max(4000).optional(),
  topics: uniqueStrings(topicTitle, 50).optional(),
  objectives: uniqueStrings(z.string().trim().min(1).max(500), 20).optional(),
  archived: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'revision'), 'Informe uma alteração.');
export type CoursePatch = z.infer<typeof coursePatchSchema>;

export const classInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  period: z.string().trim().max(120).optional().default(''),
}).strict();
export type ClassInput = z.infer<typeof classInputSchema>;

export const classPatchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  period: z.string().trim().max(120).optional(),
  archived: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Informe uma alteração.');

export const invitationInputSchema = z.object({
  expiresInHours: z.number().int().min(1).max(168).optional().default(72),
  maxUses: z.number().int().min(1).max(10000).optional().default(100),
}).strict();
export type InvitationInput = z.infer<typeof invitationInputSchema>;

export const enrollmentInputSchema = z.object({ code: z.string().trim().min(32).max(256) }).strict();

export const materialInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
  kind: z.enum(['PDF', 'PPTX']),
  classification: z.enum(['ACADEMIC', 'TEACHER_SECRET']).default('ACADEMIC'),
}).strict();
export type MaterialInput = z.infer<typeof materialInputSchema>;

export const materialReleaseInputSchema = z.object({ revision: z.number().int().positive() }).strict();
export const paginationSchema = z.object({ cursor: z.string().max(512).optional() });

export function parseDto<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    fail(400, 'VALIDATION_FAILED', 'Revise os campos enviados.', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    });
  }
  return result.data;
}

export function parseUuid(value: string): string {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) {
    fail(400, 'VALIDATION_FAILED', 'Identificador inválido.');
  }
  return result.data;
}
