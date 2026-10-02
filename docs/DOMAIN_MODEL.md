# Modelo de domínio

## Contexto e papéis

Workspace representa contexto pessoal ou institucional futuro. Cadastro cria workspace pessoal e papel escolhido naquele contexto. `users` não tem role único de autorização; `default_persona` é preferência de interface.

- `workspace_roles` admite múltiplos papéis por usuário/contexto.
- Matrícula concede acesso somente à turma e conteúdo liberado.
- Usuário pode ser professor num contexto e aluno em outro.
- Trocar persona não altera direitos no backend.
- Aluno pode criar disciplina própria para estudo.
- Dono de workspace não acessa automaticamente arquivos privados de outro usuário.
- Administradores futuros não recebem acesso implícito às avaliações.
- Papel institucional/global futuro não é exposto no cadastro inicial.

## Domínios e fronteiras

| Domínio | Responsabilidade/entidades | Value objects | Eventos | Permitido | Proibido |
|---|---|---|---|---|---|
| Identity/Users | Conta, sessão, recuperação, perfil | Email, PasswordHash, SessionToken | UserRegistered, SessionRevoked | Audit/config | IA/provas |
| Organizations | Workspace, memberships, roles | WorkspaceId, RoleBinding | MembershipChanged | Identity/Audit | Billing decidindo papel |
| Courses | Disciplinas, tópicos, objetivos | CourseScope, TopicId | CourseCreated | Autorização/entitlements | Providers |
| Classes/Enrollments | Turmas, convites, participantes | InvitationToken, EnrollmentStatus | EnrollmentChanged | Courses/Identity/Audit | Questões privadas |
| Materials | Organização, ownership, liberação | Visibility, SecurityClassification | MaterialReleased, AccessRevoked | Academic/Documents por interface | SQL livre em provas |
| Documents | Original, páginas, chunks, versões | ContentHash, StorageKey, PipelineVersion | DocumentReady, DocumentFailed | Storage/Jobs/Embeddings | SDK chat |
| Assessments | Avaliação, questões, respostas, versões | Points, Difficulty, QuestionType | AssessmentFinalized | Academic/AI/RAG/Audit por interfaces | Study público lendo questões |
| Assignments | Trabalhos/listas | AssignmentInstructions | AssessmentCreated com tipo correspondente | Assessments | Submissões/notas antecipadas |
| Study | Conversas, artefatos, simulados, revisão | StudyContext, Citation, AttemptResult | StudyArtifactCreated, PracticeSubmitted | RAG/AI/Academic público | Repository de Assessment |
| AI | Resolver, provider, vault, uso | ModelCapability, UsageEstimate | AIRequestCompleted | Billing/quota/Audit | Entidade acadêmica específica |
| Billing | Planos, direitos, reservas, descontos | Money, Limit, BillingPeriod | UsageReserved, EntitlementsChanged | Identity/Workspace | Definir autorização pedagógica |
| Exports | Render/arquivo | ExportFormat, ExportVariant | ExportReady | Snapshot autorizado/Storage/Jobs | Conceder acesso |
| Audit | Segurança e rastreabilidade | Actor, ResourceRef, CorrelationId | Registro final | Persistência | Prompt/conteúdo bruto |

Eventos síncronos internos bastam quando não há ação externa. Usar outbox somente quando ação precisa sobreviver à falha do processo. Não adotar event sourcing.

## Agregados e invariantes

### Course/Class

- Course pertence a workspace e owner.
- Class referencia Course no mesmo workspace.
- Convite tem token hash, validade, limite de uso e revogação.
- Consumo de convite é atômico.
- Enrollment ativo condiciona leitura de conteúdo de turma.
- Remover matrícula invalida acesso e contextos dependentes.

### Material/Document

- Material sem liberação é privado.
- `ACADEMIC` pode ser liberado pelo professor responsável.
- `TEACHER_SECRET` não admite liberação estudantil.
- Documento pertence ao material e preserva original.
- READY exige versão processada completa e ativa.
- Falha de reprocessamento não substitui versão válida anterior.
- Deletion bloqueia leitura antes da limpeza física.

### Assessment

- Tipos: prova, trabalho, lista e simulado docente; definir códigos nos contratos E01.
- Questões reais e respostas são privadas.
- Quantidade/distribuição/alternativas/pontos passam por validação.
- Toda geração termina em DRAFT.
- Revisão docente é necessária para READY.
- PUBLISHED é final privado e imutável; edição exige cópia DRAFT.
- Cópia não altera original; variantes remapeiam IDs de alternativas/gabaritos.
- Trabalho/lista reusa agregado Assessment; não criar sistema de submissões agora.

```text
DRAFT → READY → PUBLISHED → ARCHIVED
```

### StudyBlueprint

- Agregado separado de Assessment.
- Seleciona tópicos previamente publicáveis, competências de catálogo e dificuldade ampla.
- Não referencia questões, respostas, prompts ou ordem de prova.
- Publicação explícita e auditada.
- Todos os alunos elegíveis recebem mesma revisão.
- Não usar sanitização automática de prova como garantia.

### Conversation/StudyArtifact

- Conversa tem proprietário, tipo e referências de contexto.
- Histórico paginado; janela de contexto limitada.
- Resumos herdam dependências das fontes.
- Revogação/exclusão invalida mensagens/artefatos dependentes.
- Artefatos versionados: resumo, explicação, flashcards, plano, revisão e exercícios semelhantes.
- Citações referenciam fontes autorizadas fornecidas ao modelo.

### PracticeTest

- Independente de avaliação privada do professor.
- Pode usar materiais liberados e blueprint publicado.
- Resposta correta não aparece no DTO anterior à submissão.
- Submission idempotente.
- Correção objetiva determinística; comentário discursivo por IA não é nota definitiva.
- Dificuldades inferidas por tópico com base em respostas, sem diagnóstico psicológico.

### Subscription/Usage

- Capability e quota são independentes de papel pedagógico.
- Reserva atômica antes da operação.
- Confirmação/liberação idempotente.
- Downgrade não apaga material; limita crescimento.
- Uso por tentativa registra pagador e incerteza.
- BYOK nunca usa credencial de terceiro.

## Estados técnicos

```text
Document: UPLOADED → PROCESSING → READY | FAILED
AI Job: QUEUED → RUNNING → SUCCEEDED | FAILED
Subscription: ACTIVE | PAST_DUE | CANCELED
```

Document/job têm `stage` para progresso real. Cancelamento no fim do período é atributo separado do estado da assinatura. Reprocessamento usa nova versão, sem manipular strings soltas.

## Dependência permitida

Aplicações → interfaces públicas dos domínios → adapters/persistência. Nenhum domínio importa aplicação. Study nunca consulta Assessment privado, nem mesmo para obter contexto a ser "sanitizado".
