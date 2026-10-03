import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApi } from '../../src/contracts/openapi';

describe('contrato HTTP público', () => {
  it('representa input anterior à transformação e trata segredos somente como escrita', () => {
    const spec = buildOpenApi([{
      method: 'post', path: '/auth/login', operationId: 'login', public: true,
      body: z.object({ email: z.string().email().transform(value => value.toLowerCase()), password: z.string().min(12) }).strict(),
    }]);
    const login = spec.paths['/auth/login'].post as {
      security: unknown[];
      parameters: { name: string; required: boolean }[];
      requestBody: { content: { 'application/json': { schema: { properties: Record<string, { type: string; writeOnly?: boolean }> } } } };
    };
    expect(login.security).toEqual([]);
    expect(login.parameters).toContainEqual(expect.objectContaining({ name: 'Origin', required: true }));
    const properties = login.requestBody.content['application/json'].schema.properties;
    expect(properties.email.type).toBe('string');
    expect(properties.password.writeOnly).toBe(true);
  });

  it('rejeita IDs e combinações método/path duplicados em vez de omitir um contrato', () => {
    expect(() => buildOpenApi([
      { method: 'get', path: '/courses/:id', operationId: 'getCourse' },
      { method: 'get', path: '/courses/:id', operationId: 'getAnotherCourse' },
    ])).toThrow(/duplicado/i);
    expect(() => buildOpenApi([
      { method: 'get', path: '/a', operationId: 'same' },
      { method: 'get', path: '/b', operationId: 'same' },
    ])).toThrow(/duplicado/i);
  });
});
