export type HttpResult<T = Record<string, unknown>> = { status: number; body: T; headers: Headers; bytes: Uint8Array };

/** Cookie/CSRF handling mirrors the browser without persisting credentials to disk. */
export class TestClient {
  private cookies = new Map<string, string>();
  csrfToken: string | undefined;

  constructor(readonly baseUrl: string, readonly origin = 'http://localhost:3000') {}

  async request<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<HttpResult<T>> {
    const headers = new Headers(init.headers);
    headers.set('origin', this.origin);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    if (this.csrfToken && !headers.has('x-csrf-token')) headers.set('x-csrf-token', this.csrfToken);
    if (typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const split = pair.indexOf('=');
      if (split < 1) continue;
      const name = pair.slice(0, split);
      const value = pair.slice(split + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const source = new TextDecoder().decode(bytes);
    let body: unknown = {};
    if (source) {
      try { body = JSON.parse(source); } catch { body = { raw: source }; }
    }
    if (body && typeof body === 'object' && 'csrfToken' in body && typeof body.csrfToken === 'string') this.csrfToken = body.csrfToken;
    return { status: response.status, body: body as T, headers: response.headers, bytes };
  }

  async json<T = Record<string, unknown>>(path: string, method: string, body: unknown): Promise<HttpResult<T>> {
    return this.request<T>(path, { method, body: JSON.stringify(body) });
  }
}
