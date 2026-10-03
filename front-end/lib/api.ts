import type { ApiErrorBody, JobView } from "./types";

const apiRoot = "/api/v1";
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export class ApiError extends Error {
  code: string;
  requestId?: string;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.code || "Não foi possível concluir a solicitação.");
    this.name = "ApiError";
    this.status = status;
    this.code = body.code || "REQUEST_FAILED";
    this.requestId = body.requestId;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase()) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${apiRoot}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const body = typeof payload === "object" && payload !== null
      ? payload as ApiErrorBody
      : { code: "REQUEST_FAILED", message: String(payload) };
    throw new ApiError(response.status, body);
  }
  return payload as T;
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const errorMessages: Record<string, string> = {
  UNAUTHENTICATED: "Sua sessão terminou. Entre novamente para continuar.",
  CSRF_INVALID: "A sessão mudou. Atualize a página e tente de novo.",
  VALIDATION_FAILED: "Confira os campos destacados e tente novamente.",
  FORBIDDEN: "Sua conta não tem acesso a esta ação neste contexto.",
  RESOURCE_NOT_FOUND: "Este conteúdo não está disponível para sua conta.",
  REVISION_CONFLICT: "Este conteúdo foi alterado em outra sessão. Recarregue antes de salvar.",
  CAPABILITY_REQUIRED: "Este recurso não está incluído no plano atual.",
  QUOTA_EXCEEDED: "O limite deste período foi atingido. Você ainda pode ler e editar seus materiais.",
  INVALID_STATE: "Esta ação não está disponível para o estado atual.",
  RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde um momento e tente de novo.",
  PROVIDER_UNAVAILABLE: "O serviço de IA está indisponível. Sua solicitação pode ser tentada novamente.",
  PROVIDER_NOT_CONFIGURED: "Conecte uma IA em Configurações para gerar este conteúdo.",
  PROVIDER_AUTH_FAILED: "Nenhuma das suas chaves de IA foi aceita. Confira as chaves em Configurações › IA.",
  DOCUMENT_NOT_READY: "Este material ainda está sendo processado.",
  CONTEXT_REVOKED: "O acesso a este contexto foi revogado. A resposta dependente não está disponível.",
  SECRET_MATERIAL_CANNOT_BE_SHARED: "Este material está marcado como secreto e não pode ser liberado.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos. Confira os dados e tente novamente.",
  ACCOUNT_UNAVAILABLE: "Não foi possível criar esta conta. Confira os dados ou entre se já tiver acesso.",
  TOKEN_INVALID_OR_EXPIRED: "Este link de recuperação não é mais válido. Solicite novas instruções para redefinir sua senha.",
  PROVIDER_RATE_LIMITED: "Sua conta de IA atingiu o limite de uso do fornecedor. Aguarde um pouco e tente de novo.",
  PROVIDER_TIMEOUT: "A IA demorou demais para responder. Tente novamente em instantes.",
  PROVIDER_REQUEST_FAILED: "O fornecedor de IA recusou a solicitação. Tente novamente em instantes.",
  MODEL_UNSUPPORTED: "O modelo escolhido não está disponível nesta conexão. Escolha outro em Configurações › IA.",
  AI_OUTPUT_INVALID: "A IA respondeu em um formato inesperado. Tente gerar novamente.",
  CREDENTIAL_CHANGED: "A chave de IA foi trocada durante o processamento. Tente novamente.",
  CREDENTIAL_UNAVAILABLE: "Não foi possível usar sua chave de IA. Confira a conexão em Configurações › IA.",
  AI_KEYS_EXHAUSTED: "Todas as suas chaves de IA atingiram o limite de uso. Aguarde o limite reiniciar ou adicione outra chave em Configurações › IA.",
  AI_KEYS_LIMIT: "Você atingiu o número máximo de chaves salvas. Remova uma para adicionar outra.",
  VAULT_NOT_CONFIGURED: "O armazenamento seguro de chaves não está configurado neste ambiente.",
};

export function errorCopy(error: unknown) {
  if (!(error instanceof ApiError)) return "Não foi possível conectar ao serviço. Confira sua conexão e tente novamente.";
  return errorMessages[error.code] || `Não foi possível concluir. Código: ${error.code}${error.requestId ? ` · solicitação ${error.requestId}` : ""}`;
}

/** Friendly copy for an error code reported outside an HTTP error, such as a failed job. */
export function errorCodeCopy(code?: string) {
  if (!code) return "O serviço não concluiu esta etapa.";
  return errorMessages[code] || `O serviço não concluiu esta etapa (código ${code}).`;
}

export function isTerminalJob(job: JobView) {
  return ["completed", "complete", "succeeded", "failed", "cancelled", "canceled"].includes((job.state || "").toLowerCase());
}
