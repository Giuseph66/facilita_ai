import { z } from 'zod';
import { sessionCookieName } from '../core/cookies';

export type PublicOperation = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  operationId: string;
  public?: boolean;
  body?: z.ZodType;
  response?: z.ZodType;
  success?: number;
  multipart?: boolean;
  binary?: boolean;
  idempotent?: boolean;
};

const errorSchema = z.object({
  code: z.string(), message: z.string(), requestId: z.string().uuid(), details: z.unknown().optional(),
});

function inputJson(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    io: 'input', cycles: 'throw',
    override: ({ jsonSchema }) => {
      const markSecrets = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node)) {
          if (key === 'properties' && value && typeof value === 'object') {
            for (const [name, property] of Object.entries(value)) {
              if (['password', 'apiKey', 'token'].includes(name) && property && typeof property === 'object') {
                (property as Record<string, unknown>).writeOnly = true;
              }
              markSecrets(property);
            }
          } else markSecrets(value);
        }
      };
      markSecrets(jsonSchema);
    },
  });
}

/** Input schemas are exactly those parsed by controllers; private AI schemas stay private. */
export function buildOpenApi(operations: PublicOperation[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  const ids = new Set<string>();
  for (const operation of operations) {
    const path = operation.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
    if (!path.startsWith('/') || ids.has(operation.operationId) || paths[path]?.[operation.method]) {
      throw new Error(`Contrato público duplicado ou inválido: ${operation.operationId}`);
    }
    ids.add(operation.operationId);
    const mutation = !['get'].includes(operation.method);
    const parameters: Record<string, unknown>[] = [...path.matchAll(/\{([^}]+)\}/g)].map(match => ({
      name: match[1], in: 'path', required: true, schema: { type: 'string' },
    }));
    if (mutation) parameters.push({
      name: 'Origin', in: 'header', required: true, schema: { type: 'string', format: 'uri' },
      description: 'Origem exata da interface configurada no servidor.',
    });
    if (mutation && !operation.public) parameters.push({
      name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' },
      description: 'Token retornado pela sessão; mutações também exigem Origin configurada.',
    });
    if (operation.idempotent) parameters.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', maxLength: 160 }, description: 'Reutilizar a mesma chave ao repetir a mesma operação.' });
    const status = operation.success ?? (operation.method === 'post' ? 201 : 200);
    const successResponse: Record<string, unknown> = { description: status === 202 ? 'Job aceito; consultar resultado autorizado.' : status === 204 ? 'Concluído sem conteúdo.' : 'Resultado autorizado.' };
    if (status !== 204) successResponse.content = operation.binary
      ? { 'application/octet-stream': { schema: { type: 'string', contentEncoding: 'binary' } } }
      : { 'application/json': { schema: operation.response ? z.toJSONSchema(operation.response, { io: 'output', cycles: 'throw' }) : { type: 'object', additionalProperties: true } } };
    const responses: Record<string, unknown> = { [status]: successResponse };
    for (const error of [400, 401, 403, 404, 409, 410, 413, 415, 422, 429, 500, 502, 503, 504]) responses[error] = {
      description: 'Erro seguro identificado por code; sem detalhes internos.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    };
    let requestBody: Record<string, unknown> | undefined;
    if (operation.multipart) requestBody = {
      required: true, content: { 'multipart/form-data': { schema: {
        type: 'object', required: ['file'], properties: { file: { type: 'string', contentEncoding: 'binary' } },
      } } },
    };
    else if (operation.body) requestBody = {
      required: true, content: { 'application/json': { schema: inputJson(operation.body) } },
    };
    paths[path] ??= {};
    paths[path][operation.method] = {
      operationId: operation.operationId,
      security: operation.public ? [] : [{ sessionCookie: [] }],
      parameters, responses, ...(requestBody ? { requestBody } : {}),
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Facilita Estudo API', version: '0.1.0',
      description: 'Contratos públicos de entrada derivados de Zod. Regras de autorização, revisões e estado são verificadas no servidor. Algumas respostas ainda têm schema genérico; consultar DEVELOPMENT_CONTRACT.md para o DTO correspondente.',
    },
    servers: [{ url: '/api/v1' }], paths,
    components: {
      schemas: { ApiError: z.toJSONSchema(errorSchema) },
      securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: sessionCookieName() } },
    },
  };
}
