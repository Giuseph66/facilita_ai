import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { OllamaCloudProvider } from '../../src/features/ai/ollama-cloud.provider';
import type { ProviderContext } from '../../src/features/ai/ai.provider';

const context: ProviderContext = { actorId: 'actor', payerScope: 'BYOK', provider: 'ollama', apiKey: 'chave-de-teste-123456', credentialRevision: 1 };
const ollamaUserId = '76c1d258-6d78-42b1-b85d-51caad324ca3';

function respond(routes: Record<string, number>) {
  return vi.fn(async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    const status = routes[path] ?? 404;
    const body = path === '/api/tags' ? { models: [{ name: 'gpt-oss:20b' }] } : status === 200 ? { id: ollamaUserId, email: 'private@example.test', name: 'pessoa' } : { error: 'invalid credentials' };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}

describe('verificação da conexão Ollama Cloud', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('recusa a chave quando a identidade é negada, mesmo com a lista pública de modelos respondendo', async () => {
    vi.stubGlobal('fetch', respond({ '/api/me': 401, '/api/tags': 200 }));
    const health = await new OllamaCloudProvider().healthCheck(context);
    expect(health.status).toBe('AUTH_FAILED');
    expect(health.models).toEqual([]);
  });

  it('confirma a conexão quando a chave é aceita', async () => {
    const fetchMock = respond({ '/api/me': 200, '/api/tags': 200 });
    vi.stubGlobal('fetch', fetchMock);
    const health = await new OllamaCloudProvider().healthCheck(context);
    expect(health.status).toBe('CONNECTED');
    expect(health.accountIdentityHash).toBe(createHash('sha256').update(`ollama:${ollamaUserId}`).digest('hex'));
    expect(JSON.stringify(health)).not.toContain(ollamaUserId);
    expect(health.models.map((model) => model.id)).toEqual(['gpt-oss:20b']);
    const meCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/me'));
    expect((meCall?.[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer chave-de-teste-123456' });
  });

  it('usa somente o campo de identidade estável também na forma PascalCase do /api/me', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const path = new URL(String(url)).pathname;
      const body = path === '/api/me' ? { ID: ollamaUserId, Email: 'private@example.test', Name: 'pessoa' } : { models: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const health = await new OllamaCloudProvider().healthCheck(context);
    expect(health.status).toBe('CONNECTED');
    expect(health.accountIdentityHash).toBe(createHash('sha256').update(`ollama:${ollamaUserId}`).digest('hex'));
    expect(JSON.stringify(health)).not.toContain(ollamaUserId);
    expect(JSON.stringify(health)).not.toContain('private@example.test');
  });

  it('trata falha do serviço como indisponível, não como chave válida', async () => {
    vi.stubGlobal('fetch', respond({ '/api/me': 503, '/api/tags': 200 }));
    const health = await new OllamaCloudProvider().healthCheck(context);
    expect(health.status).toBe('UNAVAILABLE');
  });

  it('lê a fração usada de cada janela em /api/usage e ignora campos inesperados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      limits: { session: { usage: 0.25, models: [] }, weekly: { usage: 1.4 }, broken: { usage: 'x' }, 'Bad-Name': { usage: 0.1 } },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const usage = await new OllamaCloudProvider().getUsage(context);
    expect(usage?.windows).toEqual([{ name: 'session', used: 0.25 }, { name: 'weekly', used: 1 }]);
  });

  it('não inventa uso quando a resposta não traz janelas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ activity: {} }), { status: 200 })));
    expect(await new OllamaCloudProvider().getUsage(context)).toBeNull();
  });
});


describe('controle de raciocínio na geração de resumos', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  for (const [values, expected] of [[[false, true], false], [['low', 'medium', 'high'], 'low'], [[true], undefined], [undefined, undefined]] as const) {
    it(`usa apenas controle anunciado pelo modelo: ${JSON.stringify(values)}`, async () => {
      let request: Record<string, unknown> = {};
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit) => {
        if (String(url).endsWith('/api/show')) return new Response(JSON.stringify({ thinking: { values } }));
        request = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ message: { content: 'Resumo.' } }));
      }));
      await new OllamaCloudProvider().chat({ model: 'modelo', system: 'Resumo', prompt: 'Material', thinking: 'minimal' }, context);
      expect(request.think).toBe(expected);
      if (expected === undefined) expect(request).not.toHaveProperty('think');
    });
  }

  it('preserva o comportamento padrão de outras gerações sem consultar metadados', async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init: RequestInit) => {
      expect(String(url)).toContain('/api/chat');
      return new Response(JSON.stringify({ message: { content: 'Resposta.' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaCloudProvider().chat({ model: 'modelo', system: 'Tutor', prompt: 'Pergunta' }, context);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('think');
  });

  it('continua a geração com o padrão do modelo se a consulta opcional falhar', async () => {
    let request: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit) => {
      if (String(url).endsWith('/api/show')) return new Response('{}', { status: 503 });
      request = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ message: { content: 'Resumo.' } }));
    }));
    await new OllamaCloudProvider().chat({ model: 'modelo', system: 'Resumo', prompt: 'Material', thinking: 'minimal' }, context);
    expect(request).not.toHaveProperty('think');
  });
});
