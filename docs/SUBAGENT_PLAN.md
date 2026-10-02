# Plano dos quatro subagentes

Agentes para desenvolvimento posterior. Nenhum acionado nesta etapa documental. Contratos, ownership, dependências e gates precisam estar aprovados antes do paralelismo.

## Ownership

| Agente | Responsabilidade | Pode editar | Não edita diretamente |
|---|---|---|---|
| A Frontend/UX | UI de cada entrega vertical | apps/web, docs UX, testes de componentes | Backend, schema/migrations, lockfile |
| B Backend/Domínio | API, auth, acadêmico, assessment, study, billing | apps/api, módulos próprios backend, packages/database | Providers/parsers/infra |
| C IA/RAG/Documentos | Providers/prompts/vault/parsing/embedding/RAG | backend ai/rag/documents, processors correspondentes, fixtures/evaluations próprias | Schema/migrations/controllers/entitlements |
| D Infra/QA/Segurança | Compose, jobs/storage, renderer export, CI/E2E/operação | infra, backend platform/exports, worker composition, E2E/segurança, configs raiz | Regras acadêmicas/prompts/migrations comerciais |

### Arquivos com dono único

- Contratos/OpenAPI: coordenador, após propostas dos agentes.
- Schema/migrations: B.
- Manifests raiz, lockfile/configs: D.
- API composition: B.
- Worker composition: D.
- Prompts/templates de IA: C.
- Tokens/componentes web: A.

C propõe schema/query necessária a B, não cria migration concorrente. B cria controller chamando interface pública de C; C não edita API. D compõe processors entregues por C; mudanças de composição coordenadas. Segurança transversal significa revisar/propor patch ao owner, não editar livremente todo módulo.

Dependências novas seguem confirmação exigida pelo usuário. Proposta no plano não significa instalação autorizada automaticamente.

## Protocolo

1. Coordenador atribui E{ID} e contrato aprovado.
2. Agente confirma escopo/arquivos/dependências.
3. Branch/worktree isolado.
4. Diff limitado.
5. Mudança de contrato proposta antes de executar.
6. Validações autorizadas e aceite documentados.
7. Revisão.
8. Integração DB/contratos → backend/worker → web → E2E.
9. Gate comprova entrega vertical completa.

Sem prompts vagos "faça frontend". A mesma entrega pode ter pacotes A/B/C/D; cada agente recebe arquivos e contrato específico.

## Git

main integrável; feature/eXX-descricao; develop opcional/dispensável. Commits pequenos por intenção, sem merge com gate quebrado. Mudança incompatível exige contrato/migration planejada. Worktrees isoladas; coordenador integra e resolve conflitos. Nenhum Git inicializado nesta etapa.

## Prompt comum obrigatório

```text
Contexto:
Facilita Estudo, monólito modular Next.js/NestJS/PostgreSQL/pgvector.
Leia apenas documentos e arquivos necessários à entrega atribuída.

Missão:
Execute somente E{ID}, conforme IMPLEMENTATION_PLAN.md e contrato aprovado.

Antes de editar:
Informe arquivos previstos.
Respeite AGENTS.md, ownership e fronteiras de importação.

Contrato:
Não altere DTO, evento, enum, schema ou endpoint unilateralmente.
Proponha alteração ao coordenador e aguarde contrato atualizado.

Segurança:
Não exponha avaliações, gabaritos, prompts privados ou credenciais.
Toda leitura considera ownership, workspace, matrícula e liberação.
Worker revalida autorização antes de executar e publicar resultado.

Dependências:
Confirme predecessoras e Integration Gate.
Use fixtures aprovadas enquanto integração estiver indisponível.

Validação:
Testes provam critérios da entrega, não espelham implementação.
Não executar testes, lint, build ou chamadas cloud sem autorização
exigida pelo AGENTS.md e pelas instruções do usuário.
Dependências novas exigem confirmação conforme instrução do usuário.

Entrega:
Resumo do comportamento, arquivos, contrato utilizado, validações,
aceite manual, limitações, riscos e pendências.
Não declarar pronto com requisito obrigatório pendente.
```

## Prompt A — Frontend/UX

```text
Objetivo:
Implementar parte web de E{ID} até aceite vertical.

Escopo:
apps/web; componentes/testes locais; docs UI_UX.
Primeiro pacote E04; depois telas de cada entrega aprovada.

Dependências:
E01 contratos, E02 bootstrap; backend conforme entrega.
Fixtures compatíveis com OpenAPI quando necessário.

Regras:
Paleta cinza quente/bege.
Rotas/ações por persona/contexto sem conceder permissão.
API client único, erros por code.
Não importar backend/database/providers.
Não guardar sessão/key em localStorage.
API key write-only, nunca mostrar integral após salvar.
Polling com backoff/cancelamento/estados reais.
Reordenação por teclado/botões.
Nunca renderizar gabarito em página estudantil.
Estado de fonte revogada e quota conforme contrato.

Arquivos proibidos:
packages/database, packages/backend, infra,
contracts aprovados, manifests raiz e lockfile.

Testes:
Forms críticos, empty/loading/failure, foco, teclado e viewport.
E2E compartilhado com D.

Aceite:
Fluxo contra API real; fixture não oculta falha.
Utilizável em 360 px e desktop.

Comandos previstos:
pnpm --filter @facilita/web typecheck
pnpm --filter @facilita/web test
pnpm test:e2e -- --grep <fluxo>

Não executar validações sem autorização requerida.
```

## Prompt B — Backend/Domínio

```text
Objetivo:
Persistência, API e regras de E{ID}.

Escopo:
apps/api;
backend identity/academic/materials/assessments/study/billing/audit;
packages/database.

Dependências:
E01; interfaces públicas de C/D.
Primeiro pacote funcional E05.

Regras:
Sessão opaca, CSRF, Argon2id.
Persona não concede papel.
Workspace/owner/matrícula/classificação/release.
FK composta impede cross-workspace.
Runtime sem BYPASSRLS; SQL parametrizado.
DTO explícito, sem entidade ORM.
revision para edição concorrente.
Quota atômica/idempotente.
PUBLISHED continua privado.
Study não importa repository de Assessment.
Migrations únicas, revisadas, ordenadas.

Coordenação:
C propõe documentos/vetores; você integra schema/query necessária.
D propõe jobs/storage; você integra schema.
Não modificar parsers/providers nem lockfile.

Testes:
PostgreSQL real, RLS runtime, concorrência,
estados, autorização e contrato HTTP.

Aceite:
Endpoints/DB cumprem contrato; tenants/turmas isolados.

Comandos previstos:
pnpm --filter @facilita/api typecheck
pnpm test:integration -- --grep <dominio>
pnpm test:security -- --grep <recurso>

Não executar validações sem autorização requerida.
```

## Prompt C — IA/RAG/Documentos

```text
Objetivo:
Pipeline documentos/IA de E{ID}.

Escopo:
backend documents/ai/rag;
processors correspondentes em apps/worker;
fixtures/evaluations específicas.

Dependências:
Storage/jobs D, auth/schema B, schemas/payloads E01.
Primeiro pacote E11 PDF ou E13 vault conforme predecessoras.

Regras:
Original nunca descartado.
PDF/PPTX não confiáveis, parser limitado, sem conteúdo ativo.
Embedding fingerprint fixo; query/passage compatíveis.
Busca SQL autorizada, nunca top-k global filtrado depois.
Provas/gabaritos não entram no corpus estudantil.
Não presumir structured output nativo Ollama Cloud.
JSON textual exige schema + validação semântica.
Inválido não cria avaliação.
Usage de cada tentativa, sem prompt bruto.
Key do solicitante; sem pooling/fallback cruzado.
Timeout/retry respeitam orçamento/consumo incerto.
Proveniência/citações validadas no backend.

Arquivos proibidos:
apps/web, apps/api, schema/migrations, billing,
manifests raiz e lockfile.

Testes:
FakeProvider/fake HTTP, documentos adversariais,
chunk/embedding/fontes/leakage/revogação.
Cloud real só com autorização/orçamento.

Aceite:
Contexto capturado só tem fontes autorizadas;
artefato válido tem proveniência reproduzível.

Comandos previstos:
pnpm test:ai -- --grep <feature>
pnpm test:rag
pnpm test:documents

Não executar validações sem autorização requerida.
```

## Prompt D — Infra/QA/Segurança

```text
Objetivo:
Infra e prova de operação de E{ID}.

Escopo:
infra, CI, manifests/configs raiz;
backend platform/exports;
worker composition;
tests/e2e e segurança transversal.

Dependências:
E01; schema/policies B; processors/providers C.
Primeiro pacote E02/E03; depois E09.

Regras:
DB/Redis não públicos; volumes persistentes.
Credenciais migration/runtime distintas.
Storage fora de webroot.
Outbox/worker idempotentes, sem exactly-once externo.
Payload por IDs, sem secrets/documento integral.
Logs JSON/redaction.
Renderer sem rede/HTML controlado.
Não mudar regra acadêmica para teste passar.
Sem Kubernetes/Kafka.
Backup com restore ensaiado.

Arquivos proibidos:
Domínios acadêmicos B, prompts/providers C,
schema/migrations sem coordenação.

Testes:
Gates E2E, crash/retry, upload adversarial,
RLS runtime, secrets, backup/restore/cache privado.

Aceite:
Fluxos verticais passam; restart/recovery não perde original
nem duplica efeito persistido.

Comandos previstos:
docker compose -f infra/compose.yaml config
pnpm test:e2e -- --grep <gate>
pnpm test:security
pnpm test:recovery

Scripts E02/entrega correspondente; execução requer autorização.
```

## Gates e conclusão

[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) define dependências/gates. [TEST_STRATEGY.md](TEST_STRATEGY.md) define DoD. Não liberar quatro agentes sem schema/DTO/events/env/ports/naming aprovados. Merge por entrega vertical, não "todo backend depois todo frontend".
