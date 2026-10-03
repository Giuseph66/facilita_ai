import { z } from 'zod';
import { fail } from '../../core/errors';

export const usageQuerySchema = z.object({
  period: z.enum(['day', 'month', 'lifetime', 'concurrent']).optional(),
}).strict();

export function parseUsageQuery(value: unknown): z.infer<typeof usageQuerySchema> {
  const result = usageQuerySchema.safeParse(value);
  if (!result.success) fail(400, 'VALIDATION_FAILED', 'Período de consumo inválido.');
  return result.data;
}
