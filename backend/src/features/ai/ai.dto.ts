import { z } from 'zod';

export const apiKeyInputSchema = z.object({ apiKey: z.string().min(16).max(1024) }).strict();

export const aiPreferenceInputSchema = z.object({
  mode: z.enum(['BYOK', 'PLATFORM']),
  preferredModel: z.string().min(1).max(160).optional(),
}).strict();

export const aiConnectionViewSchema = z.object({
  provider: z.literal('ollama'),
  status: z.enum(['UNVERIFIED', 'CONNECTED', 'INVALID']),
  maskedKey: z.string(),
  checkedAt: z.string().datetime().nullable(),
}).strict();

export const aiModelsViewSchema = z.object({ items: z.array(z.object({
  id: z.string(), name: z.string(), provider: z.literal('ollama'),
  capabilities: z.array(z.enum(['CHAT', 'TEXT'])),
}).strict()) }).strict();
