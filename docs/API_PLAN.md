# API e contratos

REST NestJS, prefixo `/api/v1`. Este documento é especificação descritiva; schemas executáveis e OpenAPI versionada pertencem à E01.

## Regras comuns

- UUID string, datas ISO 8601 UTC.
- Dinheiro decimal string + moeda; bytes grandes como string decimal.
- Cursor pagination e máximo configurável.
- Idempotency-Key em uploads/operações assíncronas.
- revision em edição concorrente.
- Cookie de sessão; CSRF em mutações.
- Nenhuma API key em DTO de leitura.
- DTO explícito; entidades ORM não chegam ao frontend.
- 202 = job criado, não operação concluída.
- Recursos privados desconhecidos/proibidos: 404.
- Papel válido sem entitlement: 403 CAPABILITY_REQUIRED.
- Quota: 429 QUOTA_EXCEEDED.
- Backend valida owner, workspace, matrícula, classificação e release.
- Frontend usa code, não texto arbitrário, para comportamento.

## Erros

```json
{
  "code": "DOCUMENT_NOT_READY",
  "message": "Material ainda em processamento.",
  "details": { "documentId": "uuid" },
  "requestId": "uuid"
}
```

Details tem schema por code. Não devolver stack, segredo, prompt privado ou resposta bruta do fornecedor. Códigos comuns: UNAUTHENTICATED, CSRF_INVALID, VALIDATION_FAILED, FORBIDDEN, RESOURCE_NOT_FOUND, REVISION_CONFLICT, CAPABILITY_REQUIRED, QUOTA_EXCEEDED, INVALID_STATE, RATE_LIMITED.

## DTOs

| DTO | Campos principais |
|---|---|
| SessionView | usuário público, workspaces acessíveis, personas, CSRF token |
| CourseInput | título, descrição, tópicos, objetivos |
| CourseView | id, workspaceId, proprietário público, título, revision |
| ClassInput | courseId, nome, período |
| MaterialInput | courseId, título, tipo, classificação |
| DocumentView | id, nome, tamanho, formato, estado, etapa, erro seguro |
| JobView | id, feature, estado, etapa, progresso real, resultado autorizado |
| ConversationInput | tipo, courseId/documentIds opcionais |
| MessageInput | texto, clientMessageId |
| AssessmentInput | título, tipo, courseId, classId opcional |
| QuestionInput | tipo, enunciado, opções, dificuldade, pontos |
| AssessmentGenerationInput | materiais, distribuição de tipos, total, dificuldade, instruções |
| BlueprintInput | tópicos públicos selecionados, competências, dificuldade ampla |
| StudyArtifactInput | tipo, materiais, parâmetros específicos |
| ExportInput | formato, avaliação/revisão, QUESTIONS ou ANSWER_KEY |

E01 define limites de campos, required/nullable, enums finais e schemas por kind. Proibido duplicar validators divergentes em API/web/worker. Contracts é fonte pública; schemas privados de geração ficam em validation/ai.

## Primeiros endpoints

| Método/path | Auth/papel | Request → response | Erros específicos |
|---|---|---|---|
| POST /auth/register | Público | email, senha, nome, persona → usuário/sessão | VALIDATION_FAILED, ACCOUNT_UNAVAILABLE, RATE_LIMITED |
| POST /auth/login | Público | email, senha → sessão/cookie | INVALID_CREDENTIALS, RATE_LIMITED |
| GET /auth/session | Sessão | — → SessionView | UNAUTHENTICATED |
| DELETE /auth/session | Sessão/CSRF | — → 204 | CSRF_INVALID |
| POST /auth/password-recovery | Público | email → 202 genérico | RATE_LIMITED |
| POST /auth/password-reset | Token e proteção do fluxo | token, senha → 204 | TOKEN_INVALID_OR_EXPIRED |
| GET /workspaces | Sessão | cursor → contextos acessíveis | UNAUTHENTICATED |
| GET /workspaces/:wid/courses | Participante | cursor → cursos autorizados | RESOURCE_NOT_FOUND |
| POST /workspaces/:wid/courses | Professor; aluno no espaço pessoal | CourseInput → CourseView | FORBIDDEN, QUOTA_EXCEEDED |
| GET /courses/:id | Leitor autorizado | — → CourseView | RESOURCE_NOT_FOUND |
| PATCH /courses/:id | Proprietário | input + revision → CourseView | RESOURCE_NOT_FOUND, REVISION_CONFLICT |

## Expansões incrementais

| Método/path | Auth/papel | Request → response | Erros específicos |
|---|---|---|---|
| POST /courses/:id/classes | Professor responsável | ClassInput → turma | FORBIDDEN, QUOTA_EXCEEDED |
| GET /classes/:id | Participante | — → visão conforme papel | RESOURCE_NOT_FOUND |
| POST /classes/:id/invitations | Professor responsável | validade/uso → convite | FORBIDDEN, VALIDATION_FAILED |
| POST /enrollments | Aluno | código → matrícula | INVITATION_INVALID, ENROLLMENT_CONFLICT |
| DELETE /classes/:id/enrollments/:userId | Responsável/próprio aluno | — → 204 | RESOURCE_NOT_FOUND |
| GET /courses/:id/materials | Leitor autorizado | cursor → materiais | RESOURCE_NOT_FOUND |
| POST /courses/:id/materials | Proprietário autorizado | MaterialInput → material | FORBIDDEN, QUOTA_EXCEEDED |
| PUT /materials/:id/classes/:classId | Professor proprietário | configuração → release | SECRET_MATERIAL_CANNOT_BE_SHARED |
| DELETE /materials/:id/classes/:classId | Professor proprietário | — → 204 | RESOURCE_NOT_FOUND |
| POST /materials/:id/documents | Proprietário | multipart → document + job | FILE_TOO_LARGE, UNSUPPORTED_FILE, QUOTA_EXCEEDED |
| GET /documents/:id | Leitor autorizado | — → DocumentView | RESOURCE_NOT_FOUND |
| GET /documents/:id/content | Leitor autorizado | — → stream privado | RESOURCE_NOT_FOUND |
| DELETE /documents/:id | Proprietário | — → 202 purge | RESOURCE_NOT_FOUND |
| POST /documents/:id/reprocessing | Proprietário | versão pipeline → job | JOB_ALREADY_ACTIVE, PROVIDER_UNAVAILABLE |
| GET /jobs/:id | Solicitante autorizado | — → JobView | RESOURCE_NOT_FOUND |
| PUT /ai/connections/ollama | Próprio usuário | API key → conexão mascarada | VALIDATION_FAILED |
| POST /ai/connections/ollama/checks | Próprio usuário | — → verificação | PROVIDER_AUTH_FAILED, PROVIDER_UNAVAILABLE |
| DELETE /ai/connections/ollama | Próprio usuário | — → 204 | RESOURCE_NOT_FOUND |
| GET /ai/models | Sessão | operação → modelos elegíveis | PROVIDER_UNAVAILABLE |
| PUT /ai/preferences | Próprio usuário | modo/modelo → preferência | CAPABILITY_REQUIRED, MODEL_UNSUPPORTED |
| POST /conversations | Aluno/professor | ConversationInput → conversa | CONTEXT_FORBIDDEN |
| GET /conversations/:id/messages | Proprietário | cursor → mensagens | RESOURCE_NOT_FOUND, CONTEXT_REVOKED |
| POST /conversations/:id/messages | Proprietário | MessageInput → job | RESOURCE_NOT_FOUND, CONTEXT_REVOKED, QUOTA_EXCEEDED |
| POST /study/artifacts | Aluno/professor | StudyArtifactInput → job | DOCUMENT_NOT_READY, VALIDATION_FAILED |
| GET /study/artifacts/:id | Proprietário | — → artefato | RESOURCE_NOT_FOUND |
| GET /courses/:id/assessments | Professor responsável | cursor → avaliações privadas | RESOURCE_NOT_FOUND |
| POST /courses/:id/assessments | Professor responsável | AssessmentInput → avaliação | CAPABILITY_REQUIRED, RESOURCE_NOT_FOUND |
| GET /assessments/:id | Professor autor | — → avaliação privada | RESOURCE_NOT_FOUND |
| PATCH /assessments/:id | Professor autor | edição/transição + revision → avaliação | REVISION_CONFLICT, INVALID_STATE |
| PUT /assessments/:id/questions | Professor autor | conjunto ordenado + revision → revisão | QUESTION_SCHEMA_INVALID, REVISION_CONFLICT |
| POST /assessments/:id/generations | Professor autor | AssessmentGenerationInput → job | INVALID_DISTRIBUTION, PROVIDER_NOT_CONFIGURED |
| POST /assessments/:id/copies | Professor autor | estratégia/variante → nova avaliação | RESOURCE_NOT_FOUND |
| PUT /classes/:id/study-blueprint | Professor responsável | BlueprintInput → rascunho | BLUEPRINT_FIELD_FORBIDDEN |
| POST /classes/:id/study-blueprint/publications | Professor responsável | revision → publicação | REVISION_CONFLICT |
| GET /classes/:id/study-blueprint | Participante elegível | — → revisão pública | RESOURCE_NOT_FOUND |
| POST /practice-tests/:id/attempts | Proprietário do simulado | — → tentativa sem gabarito | INVALID_STATE |
| PUT /practice-attempts/:id/submission | Proprietário | respostas → resultado | ALREADY_SUBMITTED, VALIDATION_FAILED |
| POST /assessments/:id/exports | Professor autor | ExportInput → job | EXPORT_FORMAT_UNAVAILABLE, INVALID_STATE |
| GET /exports/:id/content | Solicitante autorizado | — → stream privado | EXPORT_EXPIRED, RESOURCE_NOT_FOUND |
| GET /plans | Público | — → catálogo público | — |
| GET /me/entitlements | Sessão | — → capabilities/limites | UNAUTHENTICATED |
| GET /me/usage | Sessão | período → consumo próprio | VALIDATION_FAILED |
| POST /me/privacy-requests | Próprio usuário/reautenticação | exportar/excluir → solicitação | REAUTHENTICATION_REQUIRED |

Mapa cobre roadmap inteiro; não implementar endpoints futuros no bootstrap. Sem administração genérica antecipada. Arquivamento, metadados e state transitions usam schemas explícitos de PATCH; E01 não permite mass assignment.

## Jobs/eventos compartilhados

Contrato mínimo proposto:

```ts
type JobEnvelope = {
  schemaVersion: number;
  jobId: string;
  workspaceId: string;
  actorId: string;
  resourceId: string;
  feature: string;
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
};
```

Parâmetros específicos ficam em registro privado/contrato validado; não incluir secrets, documento integral ou prompt docente no transporte. DB guarda estado definitivo. Worker reautoriza antes de executar e publicar.

Repetição com mesma key/payload devolve operação original; mesma key com payload diferente deve falhar de forma explícita. Scope da key inclui actor/feature. Retenção/deduplicação definidas no contrato E01.

## Integração HTTP

Mesmo origin via proxy; cliente web único; cookie credentials; CSRF em mutações; requests privadas sem cache compartilhado. Polling com backoff e cancelamento ao desmontar/logout. Frontend não interpreta mensagens textuais arbitrárias.

## Gates

Auth/CSRF, schemas, ownership, revisão concorrente, isolamento de turmas/tenants, quotas, jobs privados e ausência de secrets são gates obrigatórios. [Test strategy](TEST_STRATEGY.md), [entregas](IMPLEMENTATION_PLAN.md).
