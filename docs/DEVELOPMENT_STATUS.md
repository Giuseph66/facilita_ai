# Estado do desenvolvimento

Atualização: 02/10/2026. Implementação local validada. A implantação em produção depende dos requisitos e limitações abaixo.

## Requisito atual

Servidor/worker em backend, frontend em front-end. Três subagentes GPT-6 Luna com raciocínio xhigh, coordenador responsável por integração/infra/QA. Contrato em DEVELOPMENT_CONTRACT.md prevalece sobre caminhos de monorepo anteriores.

## Evidência atual

- Estrutura pnpm, manifests/configs e compose escritos.
- Contrato de integração e ownership publicado.
- Core implementado: contas/sessões, cursos/turmas/matrículas, catálogo de planos, quotas, storage privado e solicitações de privacidade.
- Documentos, providers de IA, jobs/outbox, RAG, chat e recursos de estudo escritos. Revisão estática corrigiu autorização de fontes revogadas/apagadas em histórico, artefatos, simulados e exportação de privacidade.
- Avaliações manuais/geradas, cópias, orientações públicas de estudo e registro de controllers/providers/OpenAPI escritos. Módulo de IA registrado na API e no worker.
- Cópias remapeiam IDs de alternativas e gabarito; integração aprovada com original preservado, restrição por plano e revision conflict.
- Exportação de questões e gabarito em arquivos separados escrita, com download privado, expiração e worker.
- Interface em `front-end/` escrita a partir de `design/`; contratos de avaliações, blueprint, planos e exportação alinhados por revisão estática.
- Instalação autorizada e concluída; `pnpm-lock.yaml` gerado. PostgreSQL, Redis e Mailpit saudáveis; migrations 0001–0005 aplicadas com runtime sem bypass de RLS.
- Backend: typecheck, lint e build aprovados; 19 testes unitários e 29 integrados aprovados em execuções completas e complementares. Matrícula, papéis por workspace, quotas concorrentes, reset de senha, privacidade e restauração exercitados em bancos isolados.
- Jornada com PDF/PPTX reais, citações, resumo, flashcards, plano, revisão, exercícios, simulado/submissão e avaliação 6 objetivas/4 abertas aprovada com providers de teste. Contexto capturado do aluno não contém material secreto do professor.
- Blueprint publicado idêntico para dois alunos e independente da avaliação privada; revogação bloqueia documento, histórico e artefatos derivados. Filas isoladas por prefixo; jobs recuperados após reinício e SIGKILL durante RUNNING, sem duplicar artefato ou consumo de quota.
- Frontend: typecheck/build aprovados; lint sem erros e um aviso PostCSS. Quatro E2E desktop/mobile aprovados. Landing, login, cadastro, dashboard, disciplina e avaliação manual revisados em 1440/390 px, sem overflow horizontal.
- Embeddings reais CPU/offline validados em host e Docker: revisão E5 fixa, vetor384. PDF local de quatro páginas revisado com acentos, símbolos matemáticos simples, paginação e ausência de gabarito. PDF gerado pelo worker nativo aprovado com texto pesquisável, sem gabarito e com download privado.
- Imagens Docker backend/frontend construídas com lockfile; ferramenta pg_dump17 validada. API e worker locais ativos; interface em http://localhost:3000 e readiness da API aprovada.

Evidência e limites dos testes em [VALIDATION.md](VALIDATION.md). Configuração operacional em [OPERATIONS.md](OPERATIONS.md).

## Auditoria de conclusão

Os fluxos locais acima foram executados; isso não representa aprovação de release em produção. O PDF no container recebeu EACCES no sandbox mesmo com o perfil seccomp oficial e chromium-sandbox instalado. O PDF no host funciona; validar a política de namespaces/AppArmor do host de implantação antes de usar exportação PDF pelo worker Docker. Não foi alterada a política global desta máquina.

Cloud real não executada por falta de credencial/orçamento de teste; fake permanece restrito a test/development. Corpus amplo de fórmulas/colunas, recall e carga de produção ainda precisam de avaliação; não prometer fidelidade matemática, SLA, RPO ou RTO.

Pendências externas de produção (fornecedor de IA da plataforma, termos/comercial, preços, LGPD) permanecem explícitas. Features bloqueadas devem ficar desativadas; DOCX/PWA/OCR/admin institucional posteriores conforme plano.
