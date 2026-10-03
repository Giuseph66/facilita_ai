import { Injectable } from '@nestjs/common';
import { fail } from '../../core/errors';
import {
  AIProvider,
  GenerationInput,
  GenerationResult,
  ModelDescriptor,
  ProviderContext,
  ProviderHealth,
} from './ai.provider';

type OllamaModel = { name?: string; model?: string };

@Injectable()
export class OllamaCloudProvider implements AIProvider {
  private readonly baseUrl = 'https://ollama.com';

  async getModels(context: ProviderContext): Promise<ModelDescriptor[]> {
    const response = await this.request('/api/tags', { method: 'GET' }, context);
    if (!response.ok) this.raiseProviderError(response.status);
    const body = await this.readJson<{ models?: OllamaModel[] }>(response, 1_000_000);
    if (!Array.isArray(body.models)) return [];
    return body.models
      .map((model) => model.name ?? model.model)
      .filter((name): name is string => typeof name === 'string' && name.length > 0 && name.length <= 160)
      .map((name) => ({ id: name, name, provider: 'ollama', capabilities: ['CHAT', 'TEXT'] }));
  }

  async healthCheck(context: ProviderContext): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const models = await this.getModels(context);
      return { status: 'CONNECTED', models, checkedAt };
    } catch (error) {
      const code = this.errorCode(error);
      if (code === 'PROVIDER_AUTH_FAILED') return { status: 'AUTH_FAILED', models: [], checkedAt };
      return { status: 'UNAVAILABLE', models: [], checkedAt };
    }
  }

  generateText(input: GenerationInput, context: ProviderContext): Promise<GenerationResult> {
    return this.chat(input, context);
  }

  async chat(input: GenerationInput, context: ProviderContext): Promise<GenerationResult> {
    this.validateInput(input);
    const startedAt = Date.now();
    const response = await this.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        stream: false,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt },
        ],
        options: {
          ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
          ...(input.maxTokens === undefined ? {} : { num_predict: input.maxTokens }),
        },
      }),
    }, context);
    if (!response.ok) this.raiseProviderError(response.status);
    const body = await this.readJson<{
      model?: string;
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    }>(response, 1_000_000);
    if (typeof body.message?.content !== 'string' || body.message.content.length > 900_000) fail(502, 'AI_OUTPUT_INVALID', 'O serviço de IA retornou uma resposta inválida.');
    return {
      text: body.message.content,
      model: body.model ?? input.model,
      ...(body.prompt_eval_count === undefined ? {} : { inputTokens: this.tokenCount(body.prompt_eval_count) }),
      ...(body.eval_count === undefined ? {} : { outputTokens: this.tokenCount(body.eval_count) }),
      latencyMs: Date.now() - startedAt,
    };
  }

  private async request(path: string, init: RequestInit, context: ProviderContext): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs());
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: timeout,
        headers: { ...init.headers, Authorization: `Bearer ${context.apiKey}` },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') fail(504, 'PROVIDER_TIMEOUT', 'O serviço de IA demorou além do limite.');
      fail(503, 'PROVIDER_UNAVAILABLE', 'O serviço de IA está indisponível no momento.');
    }
  }

  private async readJson<T>(response: Response, maxBytes: number): Promise<T> {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) fail(502, 'AI_OUTPUT_INVALID', 'O serviço de IA retornou uma resposta inválida.');
    if (!response.body) fail(502, 'AI_OUTPUT_INVALID', 'O serviço de IA retornou uma resposta inválida.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          fail(502, 'AI_OUTPUT_INVALID', 'O serviço de IA retornou uma resposta inválida.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')) as T;
    } catch {
      fail(502, 'AI_OUTPUT_INVALID', 'O serviço de IA retornou uma resposta inválida.');
    }
  }

  private validateInput(input: GenerationInput): void {
    if (!input.model || input.model.length > 160 || input.system.length > 32_000 || input.prompt.length > 160_000 ||
        (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) ||
        (input.maxTokens !== undefined && (!Number.isSafeInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 8_192))) {
      fail(400, 'VALIDATION_FAILED', 'A solicitação de IA excede os limites permitidos.');
    }
  }

  private tokenCount(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) fail(502, 'AI_OUTPUT_INVALID', 'O serviço de IA retornou contadores inválidos.');
    return value;
  }

  private timeoutMs(): number {
    const configured = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 90_000);
    return Number.isSafeInteger(configured) ? Math.min(Math.max(configured, 1_000), 180_000) : 90_000;
  }

  private raiseProviderError(status: number): never {
    if (status === 401 || status === 403) fail(502, 'PROVIDER_AUTH_FAILED', 'A conexão de IA precisa ser verificada.');
    if (status === 429) fail(503, 'PROVIDER_RATE_LIMITED', 'O serviço de IA atingiu o limite temporário.');
    if (status >= 500) fail(503, 'PROVIDER_UNAVAILABLE', 'O serviço de IA está indisponível no momento.');
    if (status === 404) fail(422, 'MODEL_UNSUPPORTED', 'O modelo não está disponível neste serviço.');
    fail(502, 'PROVIDER_REQUEST_FAILED', 'Não foi possível concluir a operação de IA.');
  }

  private errorCode(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;
  }
}
