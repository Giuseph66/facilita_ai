import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(request: { headers: Record<string, unknown>; requestId?: string }, response: { setHeader(name: string, value: string): void }, next: () => void): void {
  const supplied = request.headers['x-request-id'];
  const requestId = typeof supplied === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : randomUUID();
  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}
