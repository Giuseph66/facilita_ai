export interface ProviderContext {
  actorId: string;
  payerScope: 'BYOK' | 'PLATFORM';
  provider: 'ollama';
  apiKey: string;
  credentialRevision: number;
}

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: 'ollama';
  capabilities: Array<'CHAT' | 'TEXT'>;
}

export interface GenerationInput {
  model: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Only FakeAIProvider reads this in development/test; cloud adapters must ignore it. */
  developmentFakeResponse?: unknown;
}

export interface GenerationResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface ProviderHealth {
  status: 'CONNECTED' | 'AUTH_FAILED' | 'UNAVAILABLE';
  models: ModelDescriptor[];
  checkedAt: string;
}

export interface AIProvider {
  getModels(context: ProviderContext): Promise<ModelDescriptor[]>;
  healthCheck(context: ProviderContext): Promise<ProviderHealth>;
  generateText(input: GenerationInput, context: ProviderContext): Promise<GenerationResult>;
  chat(input: GenerationInput, context: ProviderContext): Promise<GenerationResult>;
}

export interface ResolvedAIProvider {
  provider: AIProvider;
  context: ProviderContext;
  model: string;
}
