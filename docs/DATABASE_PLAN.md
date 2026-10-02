# Plano de banco de dados

Proposta incremental, sem migrations executadas. PostgreSQL próprio/self-hosted + pgvector, Drizzle e driver pg. Cada conjunto de tabelas entra na entrega correspondente; não criar tudo no bootstrap.

## Convenções

- PK UUID; datas timestamptz UTC.
- Conteúdo acadêmico tem workspace_id e ownership explícito.
- FKs entre entidades de tenant usam workspace_id, impedindo vínculos cruzados.
- Tabelas referenciadas precisam unique(workspace_id, id) quando usadas por FK composta.
- Campos relacionais importantes não ficam apenas em JSONB.
- JSONB limitado a payload validado, opções, rubricas e metadados.
- Dinheiro numeric + moeda; bytes bigint; nunca float monetário.
- revision integer para concorrência.
- Estados fechados em text + CHECK, sincronizados com contratos.
- Códigos de role/capability controlados; planos configuráveis em tabelas.
- created_at/updated_at onde há mutação; eventos imutáveis têm created_at.
- Índices das FKs/consultas descritas; evitar índices redundantes.
- Migrations SQL revisadas, ordenadas e com migrator separado de runtime.

## Identidade e contexto — E05

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| users | id uuid, email_normalized text, name text, password_hash text, email_verified_at timestamptz nullable, default_persona text, status text, timestamps | email unique; persona somente UX |
| sessions | id uuid, user_id uuid FK, token_hash text, csrf_token_hash text, expires_at, absolute_expires_at, revoked_at nullable, last_seen_at | token_hash unique; user/expiration |
| account_tokens | id uuid, user_id FK, purpose text, token_hash text, expires_at, consumed_at nullable | token_hash unique; uso único |
| workspaces | id uuid, type text, name text, owner_user_id FK, acl_version integer, timestamps | PERSONAL/INSTITUTION; instituição posterior |
| workspace_memberships | workspace_id FK, user_id FK, status text, joined_at | PK(workspace_id,user_id); user/status |
| workspace_roles | workspace_id, user_id, role text | unique workspace/user/role; FK composta membership |

Conta desativada revoga sessões. Exclusão definitiva usa processo de privacidade, não somente deleted_at. Hash de token não é o token utilizado pelo cliente.

## Acadêmico — E07/E08

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| courses | id, workspace_id, owner_user_id, title text, description text, revision integer, archived_at nullable, timestamps | unique workspace/id; workspace/owner |
| course_topics | id, workspace_id, course_id, title text, position integer, publication_status text | FK course/workspace; posição única por course |
| classes | id, workspace_id, course_id, teacher_user_id, name text, period text, archived_at nullable, timestamps | FK composta course; teacher/course |
| enrollments | workspace_id, class_id, user_id, role text, status text, joined_at | unique class/user; STUDENT/TEACHER; class/workspace FK |
| class_invitations | id, workspace_id, class_id, token_hash, expires_at, max_uses integer, used_count integer, revoked_at nullable | token_hash unique; contagem atômica; valores não negativos |

Membership de workspace não concede leitura geral do curso docente. Matrícula e liberação são necessárias. Class/course precisam pertencer ao mesmo workspace.

## Materiais/originais — E10

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| materials | id, workspace_id, course_id, owner_user_id, title, kind, classification, revision, archived_at, timestamps | course/owner; ACADEMIC/TEACHER_SECRET |
| material_class_releases | workspace_id, material_id, class_id, released_at, revoked_at | unique material/class; FKs compostas |
| documents | id, workspace_id, material_id, owner_user_id, original_storage_key text, original_name text, mime_type text, size_bytes bigint, sha256 text, status, stage, error_code nullable, active_version_id nullable, deleted_at nullable, timestamps | storage_key unique; material/status; bytes não negativos |

Sem release = privado. Material TEACHER_SECRET não pode ser liberado. Materiais pessoais do aluno não são visíveis ao professor por associação à turma. PDF/PPTX completo não vira BYTEA; apenas referência opaca no banco.

## Documentos processados — E11/E12/E15

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| document_versions | id, workspace_id, document_id, version integer, parser_version text, chunker_version text, embedding_fingerprint text, status, created_at | unique document/version; FK document/workspace |
| document_pages | id, workspace_id, version_id, page_number integer, extracted_text text, metadata jsonb | unique version/page; página positiva |
| document_chunks | id, workspace_id, version_id, page_id, position integer, content text, token_count integer, content_hash text, metadata jsonb, created_at | unique version/page/position; FK página/version/workspace; tokens não negativos |
| document_chunk_embeddings | chunk_id, workspace_id, embedding_fingerprint text, embedding vector(384), created_at | unique chunk/fingerprint; FK chunk/workspace |

Embedding separado permite reindexar sem duplicar texto. page_number é página PDF/número de slide; chunk inicial não atravessa página. position ordena dentro da página. Metadados não substituem ownership/FKs.

active_version_id deve referenciar versão do mesmo documento/workspace, não apenas UUID global. Ativação somente após pipeline completo. Falha de nova versão mantém versão anterior válida. Documento excluído deixa de participar da busca imediatamente.

Busca inicial exata com índices B-tree para filtros. HNSW entra apenas após medição. Nunca misturar fingerprints; nova dimensão exige migration/estratégia explícita. Não confundir limite de dimensão de índice com limite geral do tipo.

## Avaliações privadas — E19/E20/E21

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| assessments | id, workspace_id, author_user_id, course_id, class_id nullable, title, kind, state, revision integer, family_id uuid, variant_label nullable, copied_from_id nullable, timestamps | autor/curso; FKs de mesmo workspace |
| assessment_questions | id, workspace_id, assessment_id, position, type, statement text, options jsonb, difficulty, points numeric, revision | posição única por assessment; pontos não negativos |
| assessment_answers | question_id, workspace_id, correct_option_id nullable, expected_answer text nullable, rubric jsonb nullable | 1:1 com question; validação conforme tipo |
| assessment_generations | id, workspace_id, assessment_id, job_id, actor_id, provider, model, prompt_name, prompt_version, schema_version, configuration jsonb, generated_at | job unique; configuração privada |
| assessment_generation_sources | generation_id, document_version_id, chunk_id, page_number | FKs; generation index |

Options têm IDs distintos; gabarito referencia opção existente. Validar essas relações em serviço/schema, além das constraints possíveis no banco. Não incluir respostas no DTO de questão reaproveitado em Study.

Estados: DRAFT → READY → PUBLISHED → ARCHIVED. PUBLISHED continua privado/imutável; alteração cria cópia DRAFT. family_id agrupa variantes; copiar não altera original.

## Blueprint — E22

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| study_blueprints | id, workspace_id, class_id, state, revision, difficulty, created_by, published_at nullable, timestamps | class/state; publicação explícita |
| study_blueprint_topics | blueprint_id, course_topic_id, competency_code | unique blueprint/topic/competency; tópicos públicos de mesmo course/workspace |

Sem FK para questões/respostas privadas. Revisões publicadas entregues igualmente a todos os elegíveis. Não guardar enunciado, ordem, prompt, distribuição/pontuação real.

## Conversas e estudo — E17/E18/E24

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| conversations | id, workspace_id, owner_user_id, kind, title, context_revision, timestamps | owner/updated_at |
| conversation_contexts | id, conversation_id, type, course_id nullable, document_id nullable | CHECK referência por type; relações autorizadas |
| messages | id, conversation_id, role, content text, state, client_message_id, prompt_version nullable, created_at | client_message_id unique por conversa; conversa/ordem |
| message_citations | message_id, document_version_id, chunk_id, page_number, label | FKs; fontes autorizadas |
| conversation_summaries | id, conversation_id, until_message_id, content text, source_scope_version, prompt_version | conversation index; herda fontes |
| study_artifacts | id, workspace_id, owner_user_id, kind, payload jsonb, schema_version, generation_job_id, created_at | schema por kind; owner/time |
| study_artifact_sources | artifact_id, document_version_id, chunk_id nullable | proveniência/invalidação |

Kind do artifact: resumo, explicação, flashcards, plano de estudos, revisão e exercícios semelhantes. Históricos/summaries também carregam dependências para invalidar dados derivados após revogação. Na E01 definir representação de dependências não expressas em citations, sem duplicar fontes de verdade.

## Simulados — E23

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| practice_tests | id, workspace_id, owner_user_id, title, artifact_id, state | não referencia Assessment privado |
| practice_questions | id, test_id, position, statement, options jsonb, topic_ids | posição única; tópicos validados |
| practice_answers | question_id, correct_option_id, explanation, rubric | server-only antes de submissão |
| practice_attempts | id, test_id, user_id, state, answers jsonb, result jsonb, started_at, submitted_at | submissão idempotente; owner/test |

Tentativa congela versão das questões usada. Não alterar questão de tentativa iniciada sem política explícita. Dificuldade por tópico deriva do resultado, sem diagnóstico.

## IA/jobs — E09/E13/E14

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| ai_connections | id, user_id, provider, ciphertext, nonce, auth_tag, key_version, masked_suffix, status, checked_at, credential_revision | unique user/provider; sem plaintext |
| ai_preferences | user_id, mode, preferred_model, updated_at | PK user |
| ai_usage_events | id, operation_id, attempt, actor_id, payer_scope, provider, model, feature, input_tokens nullable, cached_input_tokens nullable, output_tokens nullable, token_source, estimated_cost numeric nullable, currency, price_version, latency_ms, success boolean, error_code nullable, created_at | unique operation/attempt; actor/time |
| jobs | id, workspace_id, actor_id, feature, state, stage, resource_id, idempotency_key, payload_version, result_ref nullable, error_code nullable, timestamps | unique actor/feature/idempotency_key |
| outbox_events | id, type, payload jsonb, created_at, dispatched_at nullable, attempts | índice não despachados |

Jobs guardam IDs/referências, não credenciais nem documento integral. Resultado é referência autorizada; quem lê job precisa acesso ao recurso. Uso desconhecido não é zero.

## Quotas/comercial — E06/E26 e cobrança futura

| Tabela | Colunas | Constraints/índices |
|---|---|---|
| plans | id, code, name, status, catalog_version | code/version unique |
| plan_prices | id, plan_id, currency, interval, amount numeric, valid_from, valid_until | preço versionado |
| plan_entitlements | plan_id, capability, value_type, value jsonb | unique plan/capability |
| subscriptions | id, account_id, plan_id, state, period_start, period_end, cancel_at_period_end, provider_ref nullable | account/state |
| usage_counters | account_id, metric, period_start, used, reserved | PK account/metric/period |
| usage_reservations | id, operation_id, account_id, metric, amount, state, expires_at | unique operation/metric |
| usage_events | id, operation_id, account_id, metric, delta, reason, created_at | idempotência por operação/evento |
| discount_rules | id, code, eligibility_type, percentage numeric, stack_policy, cap numeric, valid_from, valid_until, status | versão/regra explícita |
| invoices | id, subscription_id, amount numeric, currency, state, provider_ref, issued_at | futura cobrança |

`account_id` representa titular de cobrança. VALIDACÃO NECESSÁRIA em E01: concretizar FK e associação entre usuário, workspace pessoal e conta pagadora; nunca usar ID sem entidade/fk definida. No MVP pessoal uma conta pagadora por titular; cobrança institucional posterior. Invoices/provider fields só entram quando houver cobrança efetiva.

## Auditoria/exports/privacidade — incremental

| Tabela | Colunas |
|---|---|
| audit_events | actor_id, action, resource_type, resource_id, workspace_id, request_id, job_id, metadata segura, created_at |
| exports | id, actor_id, assessment_id, assessment_revision, format, variant, storage_key, expires_at, status |
| privacy_requests | id, user_id, type, state, requested_at, completed_at, error_code |

## ERD textual

```text
User ──< Session
User ──< WorkspaceMembership >── Workspace
WorkspaceMembership ──< WorkspaceRole
Workspace ──< Course ──< Class ──< Enrollment >── User
Course ──< CourseTopic
Course ──< Material ──< MaterialClassRelease >── Class
Material ──< Document ──< DocumentVersion
DocumentVersion ──< DocumentPage ──< DocumentChunk
DocumentChunk ──< DocumentChunkEmbedding
Course ──< Assessment ──< AssessmentQuestion ── AssessmentAnswer
Assessment ──< AssessmentGeneration ──< GenerationSource
Class ──< StudyBlueprint ──< BlueprintTopic >── CourseTopic
User ──< Conversation ──< Message ──< MessageCitation
Conversation ──< ConversationContext / ConversationSummary
User ──< StudyArtifact ──< ArtifactSource
StudyArtifact ── PracticeTest ──< PracticeQuestion ── PracticeAnswer
PracticeTest ──< PracticeAttempt
User ──< AIConnection / AIUsageEvent
BillingAccount ──< Subscription >── Plan ──< Entitlement
BillingAccount ──< UsageCounter / UsageReservation / UsageEvent
Job ── OutboxEvent
Assessment ──< Export
```

## RLS, retenção e exclusão

Runtime sem BYPASSRLS/superuser/ownership de tabelas. Migrator separado. Contexto por transação e SET LOCAL; sem contexto, negar. FKs compostas complementam autorização/RLS. Worker revalida actor/recurso. Dispatcher só acessa informação técnica mínima.

Curso/turma/avaliação: arquivamento funcional. Documento: bloqueio imediato, purge assíncrono de original/páginas/chunks/vetores. Credencial: ciphertext removido imediatamente. Exports: TTL e reautorização. Telemetria/audit: retenção configurada/minimização. Histórico derivado de fonte revogada: invalidado/bloqueado. Backups precisam reaplicação de exclusões na restauração.

Migrations devem preservar dados e permitir rollback de aplicação compatível; mudança destrutiva precisa plano específico. Não prometer reversão automática de toda migration.
