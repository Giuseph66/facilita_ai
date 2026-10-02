# Estratégia de testes e Definition of Done

Nenhum comando abaixo foi executado na etapa documental. Instrução do usuário: não rodar testes, lint, build ou comandos demorados sem confirmação. Respeitar também autorização para novas dependências e chamadas cloud pagas.

## Matriz

| Camada | Prova necessária |
|---|---|
| Unitário | Transições, distribuição, quotas, schemas, resolver |
| Banco | FKs compostas, uniques, transações, RLS com runtime |
| HTTP | Auth/CSRF, DTO/error code, ownership, revision |
| Worker | Outbox/redelivery/restart/deadline/idempotência |
| Parser | PDF/PPTX válidos, inválidos e adversariais |
| IA | FakeProvider/fake HTTP, saída inválida, falhas, uso ausente |
| RAG | Contexto autorizado, fontes, recall, revogação |
| Frontend | Forms/estados complexos e acessibilidade |
| E2E | Jornadas com API/DB/worker reais, IA fake |
| Export | Conteúdo/gabarito separado/render visual |
| Operação | Backup/restore, Redis/provider offline, shutdown |

Vitest e Playwright propostos; versões/dependências confirmadas no bootstrap. Não criar teste que apenas espelhe implementação. Testar fronteiras, estados, concorrência e falhas. Não repetir toda suíte sem mudança/falha/concern que justifique.

## Fluxos E2E obrigatórios

Cadastro; login/logout/reset; escolha aluno/professor; disciplina; convite/matrícula; PDF/PPTX upload; processamento; pergunta com referência; avaliação manual/IA; edição/cópia/variante; aluno bloqueado em prova; blueprint igual para turma; PDF prova/gabarito; simulado/submissão; flashcards/plano/revisão; quota; troca/remoção de provider; privacidade e recovery operacional.

## IA determinística

FakeAIProvider e fake transport: respostas válidas, malformed JSON, schema válido mas regra inválida, output parcial, repair, 401/429/timeout, usage faltante, credencial revogada e retry. Não depender de resposta real do modelo para CI.

Cloud real separado e opt-in, com credencial de teste, orçamento/consentimento de execução, revalidação de capacidade e revisão humana. Não presumir schema nativo Ollama Cloud.

## Corpus

- PDF português com acentos.
- PDF de fórmulas/múltiplas colunas.
- PDF vazio/digitalizado/protegido/corrompido.
- PPTX notas/imagens.
- Prompt injection em material.
- Material privado/liberado/revogado.
- Prova privada com marcadores únicos.
- Duas turmas no mesmo workspace.
- Dois workspaces e usuário com múltiplos papéis.

## Gate de leakage

Criar prova/gabarito/prompt privados com marcadores. Tentar API, job, download, busca, tutor, histórico, resumo e export como aluno. Assertar ausência dos marcadores também no contexto capturado pelo fake provider. Apenas verificar resposta final é insuficiente.

RLS testada com usuário runtime sem BYPASSRLS; migrator/superuser não serve como prova. Repetir caso após revogação e durante execução de job.

## Metas

- Zero conteúdo proibido em API/contexto/export nos testes de isolamento.
- Citações resolvem exclusivamente fontes fornecidas/autorizadas.
- Nenhuma avaliação inválida persistida.
- Recall@k medido contra corpus manual; proposta recall@10 ≥0,85, limiar final após spike.
- CPU/RAM/latência medidas antes de prometer SLA.
- Export com revisão visual, acentos, ordem e matemática.

## Definition of Done por entrega

1. Objetivo/aceite manual atendidos.
2. Diff dentro do escopo/ownership.
3. Contratos/OpenAPI compatíveis e atualizados.
4. DTO/schema validados.
5. Autorização server-side/RLS aplicáveis demonstradas.
6. Migration revisada, dados preservados.
7. Testes necessários executados com autorização e aprovados.
8. Sem secrets/conteúdo privado em logs/DTOs.
9. Jobs com timeout/idempotência/falha recuperável.
10. Quota/usage aplicáveis corretos.
11. UI empty/loading/failure/success.
12. Acessibilidade essencial verificada.
13. Proveniência nos resultados documentais.
14. Limitações/pendências documentadas.
15. Gate aprovado.
16. Requisito obrigatório não escondido por mock/skip/fallback.

## Definition of Done de release

Jornadas críticas aprovadas; backup e restore ensaiados; secrets externos; HTTPS/exposição revisados; retenção/exclusão operacional; fornecedores/público validados; recursos bloqueados desativados; runbook de deploy/rollback/incidente disponível.

## Scripts previstos

```text
pnpm contracts:check
pnpm typecheck
pnpm lint
pnpm build
pnpm test:integration -- --grep <dominio>
pnpm test:documents
pnpm test:ai
pnpm test:rag
pnpm test:security -- --grep <recurso>
pnpm test:exports
pnpm test:e2e -- --grep <fluxo>
pnpm test:recovery
pnpm test:release
```

Scripts futuros, criados E02/entrega correspondente. Não representam comandos já disponíveis ou checks aprovados. [Gates/roadmap](IMPLEMENTATION_PLAN.md).
