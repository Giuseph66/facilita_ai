import { z } from 'zod';
import { fail } from '../../core/errors';

export const privacyRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('EXPORT'), password: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal('DELETE_ACCOUNT'), password: z.string().min(1).max(128), confirmation: z.literal('EXCLUIR') }).strict(),
]);
export type PrivacyRequestInput = z.infer<typeof privacyRequestSchema>;

export function parsePrivacyRequest(value: unknown): PrivacyRequestInput {
  const result = privacyRequestSchema.safeParse(value);
  if (!result.success) fail(400, 'VALIDATION_FAILED', 'Revise os campos enviados.');
  return result.data;
}
