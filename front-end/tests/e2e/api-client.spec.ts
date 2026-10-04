import { expect, test } from '@playwright/test';
import { api } from '../../lib/api';

test('cliente recupera uma leitura do proxy sem repetir escritas ou erros da API', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  try {
    globalThis.fetch = async () => {
      attempts += 1;
      return attempts === 1
        ? new Response('Internal Server Error', { status: 500 })
        : Response.json({ ok: true });
    };
    expect(await api('/read-probe')).toEqual({ ok: true });
    expect(attempts).toBe(2);

    attempts = 0;
    await expect(api('/write-probe', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 500 });
    expect(attempts).toBe(1);

    attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return Response.json({ code: 'HTTP_INTERNAL_ERROR' }, { status: 500 });
    };
    await expect(api('/error-probe')).rejects.toMatchObject({ status: 500, code: 'HTTP_INTERNAL_ERROR' });
    expect(attempts).toBe(1);

    attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return new Response('Internal Server Error', { status: 500 });
    };
    await expect(api('/persistent-failure')).rejects.toMatchObject({ status: 500 });
    expect(attempts).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
