# Decisões arquiteturais

## Contexto e estado

Produto web acadêmico para professores e alunos, com materiais, estudo por IA e avaliações privadas. Stack preferencial Next.js/NestJS/PostgreSQL; monólito modular, infraestrutura controlada e quatro agentes no desenvolvimento posterior.

Decisões abaixo são propostas do planejamento. Não significam implementação ou validação comercial concluída. Fontes externas foram consultadas em 02/10/2026.

## ADRs

| ADR | Problema | Opções | Decisão | Justificativa | Consequências |
|---|---|---|---|---|---|
| 001 | Organizar produto sem infraestrutura excessiva | Aplicação sem fronteiras; monólito modular; microserviços | Monólito modular | Fronteiras claras, deploy simples e transações locais | API e worker compartilham módulos internos |
| 002 | Gerenciar monorepo | pnpm; pnpm + Turborepo; Nx | pnpm workspaces inicialmente | Três aplicações não exigem orquestrador adicional | Adicionar Turborepo somente com benefício medido de cache/execução incremental |
| 003 | Persistência tipada com recursos PostgreSQL | Prisma; Drizzle; TypeORM | Drizzle + pg | Adequação a SQL explícito, pgvector e políticas de banco | SQL das migrations revisado; equipe precisa dominar PostgreSQL |
| 004 | Autenticação web | JWT/refresh; sessão opaca; fornecedor externo | Sessão opaca em cookie | Revogação simples, menor complexidade | Consulta de sessão; JWT dispensável no início |
| 005 | Múltiplos papéis | users.role; papéis globais; contextuais | Papéis por workspace e turma | Usuário pode ensinar e estudar em contextos distintos | Persona de UI não concede autorização |
| 006 | Reusar domínio em API/worker | Importar API; duplicar serviços; pacote interno | packages/backend exclusivo de API/worker | Reuso explícito sem dependência entre aplicações | Frontend proibido de importar módulos internos |
| 007 | Entrega confiável de jobs | Enqueue direto; transação distribuída; outbox | Outbox PostgreSQL + BullMQ | Evita perda entre commit e Redis | Dispatcher, reconciliação e idempotência |
| 008 | Preservar originais e permitir S3 | Filesystem direto; abstração; BYTEA | StorageProvider, filesystem inicial | Regras independentes do storage | Banco guarda referências; compensação entre storage e DB |
| 009 | Embeddings independentes de BYOK | Presumir cloud; fornecedor externo; CPU interno | E5 multilíngue no worker, via adapter | Índice não depende de chave pessoal ou Ollama local | Medir CPU, RAM e qualidade |
| 010 | Recuperar apenas conteúdo autorizado | Filtrar depois; SQL autorizado; instruir modelo | SQL autorizado + RLS | Conteúdo proibido não chega ao modelo | Aplicar também a histórico, jobs, fontes e exports |
| 011 | Conectar professor e estudo | Sanitizar prova automaticamente; blueprint separado | Blueprint de tópicos já publicáveis | Evita derivar conteúdo público de questões secretas | Publicação explícita pelo professor |
| 012 | JSON com Ollama Cloud | Presumir schema nativo; validar texto; bloquear tudo | Texto → parse → schema → validação semântica | Não inventa capacidade cloud | Saída inválida falha sem criar avaliação |
| 013 | Publicar avaliação | Liberar diretamente ao aluno; finalizar documento | PUBLISHED continua privado | Aplicação online de prova real não foi especificada | Liberação exige requisito futuro separado |
| 014 | Regras comerciais | Condicionais por plano; serviço central | Capabilities + limites versionados | Evita acoplamento comercial | Entitlement não concede papel pedagógico |
| 015 | Primeira exportação | PDF; DOCX; ambos | PDF + impressão | Menor escopo e validação visual | DOCX posterior |
| 016 | IA da plataforma | Chaves dos usuários; conta própria; fornecedor separado | Credencial própria da plataforma | Isolamento e responsabilidade financeira | Fornecedor e contrato pendentes |

## Comparação de ORM

Avaliação técnica para este produto, não ranking universal:

| Critério | Prisma | Drizzle | TypeORM |
|---|---|---|---|
| Tipagem | Cliente gerado | Schema TypeScript, SQL explícito | Entidades/repositories |
| Produtividade CRUD | Alta | Alta, maior proximidade do SQL | Alta para equipes acostumadas ao padrão |
| Migrations | Fluxo próprio | SQL gerado/customizado, revisável | Migrations disponíveis |
| PostgreSQL específico | Pode exigir SQL customizado | Bom encaixe com operações explícitas | Possível, com escape SQL |
| pgvector | Validar versão e tipos | Guia específico para vetores/índices | Validar integração na versão escolhida |
| Escolha | Alternativa forte | Recomendada | Menor benefício no contexto atual |

FATO VERIFICADO: Drizzle documenta vetores, índices, extension via migration customizada e geração/aplicação de migrations SQL. [pgvector](https://orm.drizzle.team/docs/guides/vector-similarity-search), [migrations](https://orm.drizzle.team/docs/migrations).

Regra: revisar migrations geradas; nunca sincronizar schema automaticamente em produção. Revisar constraints, RLS, índices e impacto operacional. Fixar versões na E02; não instalar dependências nesta etapa documental.

## Pendências e bloqueios

| Pendência | Proposta inicial | Bloqueia |
|---|---|---|
| Idade/público | Acadêmico adulto | Cloud por menores |
| Formatos | PDF/PPTX | PPT, ODP e outros |
| Digitalizados | Preservar original, erro explicativo | OCR |
| Publicação de prova | Finalização privada | Aplicação online de avaliação real |
| Cobrança | Catálogo/entitlements e concessão controlada em piloto | Venda pública sem gateway |
| IA da plataforma | Adapter e credencial próprios | Ativação comercial |
| Embeddings CPU | E5 multilíngue pequeno | SLA definitivo |
| Preços/limites/descontos | Configuração versionada | Oferta final |
| Retenção | Por categoria | Produção |
| Instituições | Contexto preparado | Administração institucional completa |
| Qualidade matemática | Corpus técnico e revisão humana | Promessa de fidelidade de parsing/export |
| Operação | Servidor único, backup/restore | SLO, RPO e RTO finais |

VALIDAÇÃO NECESSÁRIA: termos para custódia BYOK, integração SaaS, fornecedor da plataforma, transferências internacionais, licenças de modelos/pesos, retenção, gateway, preços e critérios de piloto.

FATO VERIFICADO: termos Ollama consultados exigem idade mínima de 18 anos. A documentação da API não constitui autorização contratual para uso comercial específico ou compartilhamento de credenciais. [Termos](https://ollama.com/terms).

## Regras de mudança

1. Registrar problema, opções, decisão, justificativa e consequências.
2. Atualizar contrato e entregas afetadas antes da implementação.
3. Não alterar requisito silenciosamente.
4. Não permitir pooling, empréstimo ou uso cruzado de chaves sem autorização formal aplicável; planejamento atual implementa somente BYOK individual.
5. Não adicionar microserviços, GraphQL, Kafka, Kubernetes, service mesh, event sourcing ou CQRS completo sem necessidade concreta.
