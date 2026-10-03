# Contrato de desenvolvimento inicial

## Autorização e organização

Desenvolvimento solicitado em 02/10/2026. Requisito atual do usuário prevalece sobre a estrutura anterior: toda implementação de servidor em `backend/`, interface em `front-end/`. Root somente orquestração/documentação. Três agentes GPT-6 Luna, raciocínio xhigh, e coordenador integrador.

Arquitetura continua Next.js + NestJS + PostgreSQL/pgvector + Redis/BullMQ. Sem Supabase, pooling de keys ou fallback pago automático. Design HTML é referência visual; regras de docs prevalecem nos conflitos comerciais/segurança já identificados.

## Ownership

- Agente frontend: `front-end/**`.
- Agente backend/core: `backend/src/core/**`, `backend/src/features/auth/**`, `academic/**`, `billing/**`, `privacy/**`, `backend/src/main.ts`, `backend/src/app.module.ts`, `backend/src/worker.ts`, `backend/migrations/0001_core.sql`, `backend/src/database/**`.
- Agente IA/documentos: `backend/src/features/documents/**`, `ai/**`, `rag/**`, `assessments/**`, `study/**`, `backend/migrations/0002_intelligence.sql`, testes unitários de seus módulos.
- Coordenador: `backend/src/features/exports/**`, contracts/OpenAPI, manifests/configs, root, infraestrutura, E2E/integração, revisão e integração. Exportação transferida do agente IA por coordenação explícita.
- Não editar arquivo de outro owner sem mensagem/coordenação. Não commitar sozinho. Dependências solicitadas ao coordenador; ele mantém lockfile.

## Contrato HTTP comum

- Prefixo `/api/v1`; front-end usa `/api/v1` via proxy same-origin.
- Campos públicos camelCase. UUID string; timestamp ISO UTC; números usuais JSON, dinheiro decimal/string com moeda.
- Listas: `{ items: T[], nextCursor: string | null }`.
- Erro: `{ code, message, details?, requestId }`.
- Async: `{ job: JobView }`, status 202.
- JobView: `{ id, feature, state, stage, result?: unknown, errorCode?: string }`.
- SessionView: `{ user: { id, name, email, defaultPersona }, workspaces: [{ id, name, roles: string[] }], csrfToken }`.
- Tipo de conta fixo no cadastro: Acadêmico (`STUDENT`) ou Docente (`TEACHER`). `defaultPersona` permanece no contrato de leitura; `PATCH /me/profile` aceita somente nome. Não existe `POST /me/personas` nem alternância no perfil ou na lateral. Permissões de workspace continuam independentes do tipo de conta.
- Auth response usa SessionView; session cookie HttpOnly, CSRF token enviado em `X-CSRF-Token` nas mutações autenticadas. Token nunca localStorage.
- Mutation concorrente envia revision. Não mass assignment.
- Recursos secretos alheios retornam 404. Gates de autorização incluem worker/jobs/downloads.
- Endpoints seguem `docs/API_PLAN.md`; agentes registram discrepâncias antes de adaptar contrato.

## Core exports exigidos pelo backend

`backend/src/core/core.module.ts`: CoreModule global, exports definidos abaixo.

`backend/src/core/database.service.ts`: DatabaseService.
- `query<T>(sql: string, params?: unknown[]): Promise<T[]>` para queries técnicas/autenticação sem conteúdo privado.
- `asActor<T>(userId: string, work: (connection: QueryConnection) => Promise<T>): Promise<T>`: transação, SET LOCAL app.user_id, callback executa SQL parametrizado no mesmo client.
- QueryConnection expõe `query<T>(sql: string, params?: unknown[]): Promise<T[]>`.
- Domínios com conteúdo acadêmico usam asActor; runtime PostgreSQL sem BYPASSRLS/superuser. RLS nas migrations.

`backend/src/core/session.guard.ts`: SessionGuard autentica e valida CSRF/Origin nas mutações; `request.user` é `{ id, name, email, defaultPersona }`. Acesso a workspace e role é consultado por serviço/SQL, não presumido por persona.

`backend/src/core/errors.ts`: `fail(status: number, code: string, message: string, details?: unknown): never` lança erro compatível com filtro global.

`backend/src/core/quota.service.ts`: QuotaService.
- `reserve(userId: string, metric: string, operationId: string, amount?: number): Promise<void>`.
- `commit(userId: string, metric: string, operationId: string): Promise<void>`.
- `release(userId: string, metric: string, operationId: string): Promise<void>`.
- `require(userId: string, capability: string): Promise<void>`.
- Reserva/commit/release atômicos/idempotentes; BYOK não desliga quotas.

`backend/src/core/storage.service.ts`: StorageService put(key, Buffer), get(key), remove(key), resolve(key) com path traversal bloqueado e root privado. Interface compatível com implementação futura S3.

## Jobs e módulo de inteligência

Agente IA exporta `backend/src/features/intelligence.module.ts`: IntelligenceModule, controllers/providers de seu conjunto.

Agente IA exporta `backend/src/features/ai/jobs.service.ts`: JobsService e `backend/src/features/ai/job-runner.service.ts`: JobRunnerService.
- JobsService.create(actorId, workspaceId, feature, payload, idempotencyKey?) retorna JobView persistido e outbox; payload privado contém IDs/config, nunca credenciais.
- JobRunnerService.start() inicia BullMQ/outbox dispatch; stop() fecha recursos. Worker chama start(). API não executa worker implicitamente.
- Reautorizar ator/recurso antes de executar/publicar. Commit de resultado idempotente; invalid output não gera avaliação.
- Fila usa Redis; PostgreSQL fonte de verdade. AI_PROVIDER=fake permitido somente explicitamente em development/test; produção não usa fake.

Core owner importa IntelligenceModule em AppModule e chama JobRunnerService no worker; precisa aguardar arquivos do agente IA, sem redefinir interfaces.

## Core schema para integração

Snake_case no DB. UUIDs e timestamptz. Core migration define users, sessions, account_tokens, workspaces, workspace_memberships, workspace_roles, courses, course_topics, classes, enrollments, class_invitations, materials, material_class_releases, plans, subscriptions, usage_counters, usage_reservations, usage_events, audit_events, privacy_requests. Campos conforme DATABASE_PLAN.md.

`workspace_memberships`: workspace_id,user_id,status. `workspace_roles`: workspace_id,user_id,role. `courses`: id,workspace_id,owner_user_id,title,description,revision,archived_at. `classes`: id,workspace_id,course_id,teacher_user_id,name,period,archived_at. `materials`: id,workspace_id,course_id,owner_user_id,title,kind,classification,revision,archived_at.

IA migration define documents/versions/pages/chunks/embeddings, connections/preferences/usage, jobs/outbox, assessments/questions/answers/generations/sources, blueprints/topics, conversations/contexts/messages/citations/summaries, artifacts/sources, practice tables e exports. Composite FKs e policies RLS coerentes.

Integração via query parametrizada; Drizzle usado na conexão/schema e migrations SQL versionadas. Pedir ajustes de schema por mensagem, não inventar colunas incompatíveis.

## Limites de produto

Quatro planos configuráveis. IA plataforma permanece desativada sem fornecedor/contrato validado. PDF/PPTX digitais no lançamento; OCR, DOCX, offline/PWA, spaced repetition sofisticado e gateway de pagamento posteriores conforme plano. Nenhum recurso privado docente publicado ao aluno.

## Validação

Autorização para testes/lint/build solicitada ao usuário; pendente até resposta. Escrever testes é permitido; executar somente após liberação comunicada pelo coordenador. Sem uso de keys reais ou chamadas cloud pagas. Provar jornadas e isolamento, não apenas compilação.
