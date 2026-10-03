import { z } from 'zod';

export const apiKeyInputSchema = z.object({ apiKey: z.string().min(16).max(1024) }).strict();

export const newApiKeyInputSchema = z.object({
  apiKey: z.string().min(16).max(1024),
  label: z.string().trim().min(1).max(60).optional(),
}).strict();

export const connectionPatchSchema = z.object({
  label: z.string().trim().min(1).max(60).nullable().optional(),
  position: z.number().int().min(0).max(100).optional(),
}).strict().refine((value) => value.label !== undefined || value.position !== undefined, 'Informe ao menos um campo.');

export const aiPreferenceInputSchema = z.object({
  mode: z.enum(['BYOK', 'PLATFORM']),
  preferredModel: z.string().min(1).max(160).optional(),
}).strict();

export const aiConnectionViewSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal('ollama'),
  label: z.string().nullable(),
  position: z.number().int(),
  status: z.enum(['UNVERIFIED', 'CONNECTED', 'INVALID']),
  maskedKey: z.string(),
  checkedAt: z.string().datetime().nullable(),
  usage: z.object({
    windows: z.array(z.object({ name: z.string(), usedPercent: z.number(), remainingPercent: z.number() }).strict()),
    checkedAt: z.string().datetime(),
  }).strict().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  exhausted: z.boolean(),
}).strict();

export const aiModelsViewSchema = z.object({ items: z.array(z.object({
  id: z.string(), name: z.string(), provider: z.literal('ollama'),
  capabilities: z.array(z.enum(['CHAT', 'TEXT'])),
}).strict()) }).strict();
