# Validação local e isolamento

Execução autorizada pelo usuário em 02/10/2026. Resultados locais aprovados abaixo; limitações de produção permanecem explícitas.

Unitários: `pnpm test` (19 aprovados). Integração: suite completa com 27 aprovados em sete arquivos, seguida de execuções complementares aprovadas para SIGKILL durante RUNNING (um caso novo) e exportação (seis casos, incluindo um PDF novo). Total: 29 casos integrados distintos aprovados em oito arquivos. Frontend: quatro E2E aprovados em desktop/mobile.

Integração usa PostgreSQL/Redis reais e providers determinísticos exclusivamente em ambiente de teste. Não apontar URLs de teste para produção. O harness cria um banco de nome aleatório `facilita_test_*`, aplica as migrations com migrator distinto do runtime e remove apenas o banco que criou. Dados de desenvolvimento permanecem separados. Segredos e logs privados não são anexados a relatórios.

Fixtures PDF/PPTX são documentos mínimos reais produzidos em memória. Casos de isolamento devem usar a role runtime, nunca a role migrator para provar RLS.

## Casos executados e aprovados

- HTTP/sessão, CSRF, convites, papéis, revisão concorrente e RLS sem contexto.
- Documento acadêmico liberado versus material docente secreto, prova/gabarito privados e revogação.
- Artefato derivado antes/depois de revogação ou purge, incluindo exportação de privacidade.
- Exportação pelo worker: idempotência concorrente, questões sem gabarito, arquivo de respostas separado, acesso privado e expiração. PDF nativo gerado pelo worker, baixado via HTTP e lido com PDF.js: texto pesquisável, ausência do gabarito e acesso de terceiro negado.
- Cópia de avaliação: novas questões/alternativas, remapeamento do gabarito, família/origem e original preservado.
- Cadastro/sessão em navegador desktop e mobile.
- Quotas concorrentes, reset de senha com uso único/revogação de sessão, exportação e exclusão assíncrona de conta.
- Jornada upload PDF/PPTX → READY → release → chat/citações → materiais de estudo → simulado/submissão → avaliação gerada, com revogação de fonte.
- Contexto enviado ao fake provider sem sentinel de material docente secreto; captura privada disponível exclusivamente em NODE_ENV=test.
- Blueprint publicado igual para dois alunos, independente da avaliação privada; flashcards, plano, revisão e exercícios com schemas reais.
- Dois runtimes/filas isolados; outro worker não consome job parado, que é recuperado após reinício do worker correto.
- SIGKILL durante geração RUNNING e reinício: BullMQ recupera o job, com exatamente um artefato, um evento de uso bem-sucedido e quotas finais consistentes. Teste aprovado em 104,76 segundos; provider de teste registra chamada interrompida e repetição, sem chamada paga.
- Backup/restore de banco e arquivo em destino descartável; role runtime mantém RLS e não possui SUPERUSER/BYPASSRLS.
- Typecheck/lint/build backend e frontend aprovados (um aviso PostCSS no frontend). Builds Docker aprovados; embedding CPU real executado nos dois ambientes.
- Revisão visual em 1440/390 px e PDF local A4 de quatro páginas com acentos e matemática Unicode simples.

## Evidência ainda necessária

Sandbox do PDF no Docker deste host retorna EACCES; perfil oficial, usuário não-root e chromium-sandbox estão preparados, mas a política de namespaces/AppArmor precisa ser validada no host de implantação. PDF nativo local aprovado. Ainda pendentes cloud opt-in com credencial/orçamento, corpus amplo de fórmulas/colunas, métricas de recall/carga e políticas comerciais/privacidade de produção. Não extrapolar essas evidências para SLA, qualidade universal de parsing ou aprovação de produção.
