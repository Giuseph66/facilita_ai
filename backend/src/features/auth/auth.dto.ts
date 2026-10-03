import { z } from 'zod';
import { fail } from '../../core/errors';

export const personaSchema = z.enum(['STUDENT', 'TEACHER']);
export type Persona = z.infer<typeof personaSchema>;

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(128)
  .refine((value) => /\p{L}/u.test(value), 'A senha precisa ter ao menos uma letra.')
  .refine((value) => /\d/.test(value), 'A senha precisa ter ao menos um número.');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  persona: personaSchema,
}).strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const recoverySchema = z.object({ email: emailSchema }).strict();
export const passwordResetSchema = z.object({ token: z.string().min(32).max(256), password: passwordSchema }).strict();

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo.');
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export interface SessionView {
  user: { id: string; name: string; email: string; defaultPersona: Persona };
  workspaces: Array<{ id: string; name: string; roles: Persona[] }>;
  csrfToken: string;
}

export function parseDto<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    fail(400, 'VALIDATION_FAILED', 'Revise os campos enviados.', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    });
  }
  return result.data;
}
