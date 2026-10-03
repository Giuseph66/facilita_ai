import { Injectable } from '@nestjs/common';
import { appendFile, chmod } from 'node:fs/promises';
import { fail } from '../../core/errors';
import { AIProvider, GenerationInput, GenerationResult, ModelDescriptor, ProviderContext, ProviderHealth } from './ai.provider';

@Injectable()
export class FakeAIProvider implements AIProvider {
  private readonly replies: string[] = [];
  private readonly recordedCalls: Array<{ actorId: string; model: string; system: string; prompt: string }> = [];
  private failure?: { code: string; status: number; message: string };

  enqueueReply(reply: string): void {
    this.replies.push(reply);
  }

  failNext(code: string, status = 503, message = 'Fake provider failure'): void {
    this.failure = { code, status, message };
  }

  calls(): ReadonlyArray<{ actorId: string; model: string; system: string; prompt: string }> {
    return this.recordedCalls.map((call) => ({ ...call }));
  }

  clearCalls(): void {
    this.recordedCalls.length = 0;
  }

  async getModels(_context: ProviderContext): Promise<ModelDescriptor[]> {
    this.assertEnabled();
    this.raisePendingFailure();
    return [{ id: 'fake-e5-chat', name: 'Deterministic test model', provider: 'ollama', capabilities: ['CHAT', 'TEXT'] }];
  }

  async healthCheck(_context: ProviderContext): Promise<ProviderHealth> {
    this.assertEnabled();
    return { status: 'CONNECTED', models: await this.getModels(_context), checkedAt: new Date().toISOString() };
  }

  generateText(input: GenerationInput, context: ProviderContext): Promise<GenerationResult> {
    return this.chat(input, context);
  }

  async chat(input: GenerationInput, context: ProviderContext): Promise<GenerationResult> {
    this.assertEnabled();
    this.raisePendingFailure();
    const call = { actorId: context.actorId, model: input.model, system: input.system, prompt: input.prompt };
    this.recordedCalls.push(call);
    const capturePath = process.env.NODE_ENV === 'test' ? process.env.AI_TEST_CAPTURE_PATH : undefined;
    if (capturePath) {
      // This sink is enabled only by the isolated test harness; it may contain synthetic prompt text.
      await appendFile(capturePath, `${JSON.stringify(call)}\n`, { encoding: 'utf8', mode: 0o600 });
      await chmod(capturePath, 0o600);
    }
    if (process.env.NODE_ENV === 'test') {
      const configuredDelay = Number(process.env.AI_TEST_PROVIDER_DELAY_MS ?? 0);
      if (Number.isSafeInteger(configuredDelay) && configuredDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.min(configuredDelay, 10_000)));
      }
    }
    const queued = this.replies.shift();
    const text = queued ?? (input.developmentFakeResponse === undefined
      ? 'Resposta determinística de teste: confira as fontes autorizadas antes de usar este conteúdo.'
      : JSON.stringify(input.developmentFakeResponse));
    return {
      text,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }

  private assertEnabled(): void {
    if (process.env.AI_PROVIDER !== 'fake' || (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test')) {
      fail(503, 'PROVIDER_NOT_CONFIGURED', 'Nenhum serviço de IA está configurado.');
    }
  }

  private raisePendingFailure(): void {
    if (!this.failure) return;
    const failure = this.failure;
    this.failure = undefined;
    fail(failure.status, failure.code, failure.message);
  }
}
