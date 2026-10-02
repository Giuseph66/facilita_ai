# PAPEL DO AGENTE

Você será o **Arquiteto Principal, Tech Lead e Coordenador de Desenvolvimento** de um novo produto SaaS chamado provisoriamente **Facilita Estudo**.

Você está trabalhando em um ambiente de desenvolvimento local com acesso ao projeto, terminal, sistema de arquivos, Git e ferramentas de programação.

Sua função inicial **NÃO é começar a programar imediatamente**.

Sua primeira responsabilidade é compreender profundamente o produto, transformar os requisitos abaixo em uma arquitetura coerente e produzir um **PLANO MESTRE DE IMPLEMENTAÇÃO extremamente detalhado**, organizado em entregas pequenas, testáveis e encadeadas.

Posteriormente, este plano será executado por **quatro subagentes de desenvolvimento trabalhando em paralelo**.

Portanto, todas as decisões precisam ter:

- escopo claro;
- dependências explícitas;
- contratos entre módulos;
- critérios de aceite;
- testes previstos;
- arquivos/módulos envolvidos;
- ordem de integração;
- riscos;
- condições para considerar cada entrega concluída.

Não invente funcionalidades desnecessárias.

Não altere requisitos silenciosamente.

Quando houver uma decisão arquitetural relevante, registre:

1. problema;
2. opções consideradas;
3. decisão;
4. justificativa;
5. consequências.

Use o princípio:

> primeiro arquitetura e contratos; depois implementação.

---

# 1. VISÃO DO PRODUTO

O produto se chama provisoriamente:

**Facilita Estudo**

É uma plataforma educacional web baseada fortemente em Inteligência Artificial.

Existem inicialmente dois tipos principais de usuário:

- Professor
- Acadêmico/Aluno

A plataforma deve permitir que ambos utilizem IA para atividades acadêmicas, porém com experiências e permissões distintas.

O produto deve ser desenvolvido primeiramente como aplicação WEB responsiva.

Posteriormente poderá funcionar como PWA.

Não é prioridade inicial produzir aplicações Android ou iOS nativas.

---

# 2. OBJETIVO CENTRAL

A plataforma pretende centralizar:

- materiais acadêmicos;
- estudo assistido por IA;
- geração de avaliações;
- geração de trabalhos;
- perguntas e respostas sobre materiais;
- geração de resumos;
- simulados;
- organização de disciplinas;
- gerenciamento de turmas;
- integração com provedores de IA;
- exportação de avaliações;
- acompanhamento de utilização de IA.

O sistema deverá possuir arquitetura suficientemente modular para futuramente suportar instituições inteiras.

Entretanto, NÃO queremos começar com microserviços.

Adotar inicialmente:

**Monólito modular.**

---

# 3. STACK TECNOLÓGICA BASE

Considere como stack preferencial:

## Front-end

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- aplicação responsiva
- possibilidade futura de PWA

## Back-end

- Node.js
- NestJS
- TypeScript
- API REST inicialmente

Não usar GraphQL sem uma justificativa extremamente forte.

## Banco de dados

Usar:

**PostgreSQL próprio/self-hosted**

Não utilizar Supabase como dependência central do projeto.

Utilizar PostgreSQL diretamente através do backend.

A aplicação deverá manter controle da infraestrutura e regras de negócio.

## ORM

Avaliar e escolher entre:

- Prisma;
- Drizzle;
- TypeORM.

Apresente comparação e escolha uma opção.

A escolha deve privilegiar:

- migrations confiáveis;
- tipagem;
- produtividade;
- PostgreSQL;
- manutenção de longo prazo.

## Busca vetorial

Utilizar:

**pgvector dentro do PostgreSQL.**

Não criar um banco vetorial separado no MVP sem necessidade real.

## Filas

Planejar utilização de:

- Redis
- BullMQ

para tarefas pesadas e assíncronas.

Exemplos:

- processamento de PDFs;
- extração de texto;
- geração de embeddings;
- geração de grandes avaliações;
- exportação de documentos;
- operações demoradas de IA.

## Arquivos

O arquivo original enviado pelo usuário NÃO deve ser descartado depois da extração.

Precisamos armazenar:

1. arquivo original;
2. metadados;
3. texto extraído;
4. chunks;
5. embeddings;
6. relação com disciplina/turma/usuário.

Para desenvolvimento local, o armazenamento poderá inicialmente usar filesystem através de uma abstração de Storage.

A arquitetura deve permitir trocar posteriormente por armazenamento compatível com S3 sem modificar regras de negócio.

Criar interface semelhante a:

StorageProvider

com implementações futuras como:

LocalStorageProvider

S3StorageProvider

Nunca armazenar PDFs completos como BYTEA no PostgreSQL sem uma justificativa muito forte.

O PostgreSQL deverá armazenar metadados e referências dos arquivos.

---

# 4. ARQUITETURA GERAL DESEJADA

Esperamos algo conceitualmente semelhante a:

Frontend Next.js

↓

API NestJS

↓

Serviços de domínio

↓

PostgreSQL + pgvector

↓

Redis/BullMQ

↓

Workers

↓

Provedores de IA

↓

Storage

Mas NÃO aceite essa representação cegamente.

Analise a arquitetura e proponha melhorias quando necessário.

---

# 5. MONOREPO

Avalie a utilização de um monorepo.

Preferência inicial:

apps/

- web
- api
- worker

packages/

- shared-types
- validation
- config
- eslint-config
- typescript-config

Você deverá avaliar:

- pnpm workspaces;
- Turborepo;
- Nx.

Escolha a solução mais adequada ao projeto evitando complexidade desnecessária.

Compartilhar entre front e backend somente estruturas que façam sentido compartilhar.

Não permitir que entidades internas do banco vazem diretamente para o frontend.

Utilizar DTOs e contratos bem definidos.

---

# 6. PERFIS DE USUÁRIO

Inicialmente existem:

STUDENT

TEACHER

Posteriormente poderão existir:

INSTITUTION_ADMIN

PLATFORM_ADMIN

Não construir toda a interface administrativa agora, mas preparar o modelo de autorização para evolução futura.

Durante cadastro inicial:

usuário cria conta;

↓

seleciona inicialmente:

Professor

ou

Aluno.

A arquitetura deve permitir que futuramente um mesmo usuário possua múltiplos papéis.

Por exemplo:

uma pessoa pode ser professora em uma instituição e acadêmica em outra.

Portanto, avaliar cuidadosamente se `role` deve estar diretamente em `users` ou associado ao contexto de organização/turma.

Não implementar uma solução simplista que impossibilite múltiplos papéis futuramente.

---

# 7. EXPERIÊNCIA DO PROFESSOR

O professor deverá poder:

- criar disciplinas;
- criar turmas;
- adicionar materiais;
- enviar PDFs;
- enviar slides;
- organizar conteúdos;
- relacionar material a disciplina;
- relacionar material a turma;
- utilizar IA sobre seus conteúdos;
- solicitar geração de questões;
- gerar provas;
- gerar trabalhos;
- gerar listas de exercícios;
- gerar simulados;
- editar questões geradas pela IA;
- excluir questões;
- adicionar questões manualmente;
- ordenar questões;
- alterar dificuldade;
- alterar pontuação;
- salvar avaliações;
- duplicar avaliação;
- criar versões diferentes da mesma avaliação;
- gerar gabarito;
- exportar avaliação;
- exportar gabarito.

Preparar arquitetura para formatos futuros:

PDF

DOCX

impressão

Não necessariamente implementar todos no primeiro MVP.

---

# 8. GERAÇÃO DE PROVAS

Exemplo de solicitação:

"Crie uma prova de Cálculo III contendo 10 questões, sendo 6 objetivas e 4 discursivas, dificuldade intermediária, utilizando os materiais das aulas 3 até 8."

Fluxo esperado:

Professor seleciona disciplina.

↓

Seleciona materiais.

↓

Define configurações.

↓

Backend cria job.

↓

Sistema recupera contexto relevante.

↓

IA gera estrutura da avaliação.

↓

Resultado passa por validação estrutural.

↓

Avaliação fica em estado DRAFT.

↓

Professor revisa.

↓

Professor edita.

↓

Professor publica/finaliza.

Não assumir que texto produzido pela IA é válido.

Criar schemas estruturados para respostas do modelo.

Validar resultado da IA antes de persistir.

---

# 9. EXPERIÊNCIA DO ACADÊMICO

O aluno deverá conseguir organizar seus estudos.

Dentro de uma disciplina poderá:

- visualizar materiais permitidos;
- enviar seus próprios materiais;
- estudar PDFs;
- estudar slides;
- solicitar resumo;
- solicitar explicação;
- fazer perguntas;
- criar questões;
- criar flashcards;
- criar simulados;
- solicitar plano de estudos;
- realizar revisão para prova;
- conversar com tutor de IA;
- pedir explicação de questão;
- gerar exercícios semelhantes;
- verificar assuntos em que apresenta dificuldade.

Exemplo:

"Tenho uma prova amanhã e estes são os slides disponibilizados pelo professor."

A plataforma poderá:

1. analisar materiais;
2. detectar assuntos;
3. organizar conteúdos;
4. produzir resumo;
5. destacar conceitos importantes;
6. criar questões;
7. aplicar simulado;
8. verificar erros;
9. recomendar revisão.

---

# 10. CONTEÚDOS DO PROFESSOR E DO ALUNO

Professor e aluno podem compartilhar contexto acadêmico como:

- disciplina;
- turma;
- materiais públicos;
- ementa;
- tópicos;
- conteúdos liberados;
- objetivos de aprendizagem.

Porém existem informações PRIVADAS do professor.

Principal exemplo:

**questões reais de uma prova ainda não aplicada.**

O aluno NUNCA deverá receber:

- texto de questão privada;
- resposta;
- alternativas;
- gabarito;
- sequência das questões;
- prompt utilizado pelo professor;
- detalhes capazes de reconstruir a avaliação;
- contexto privado da avaliação.

Isso deve ser garantido no:

- banco;
- backend;
- autorização;
- RAG;
- prompt;
- APIs.

Não confiar em esconder componentes no frontend.

---

# 11. ASSESSMENT BLUEPRINT / STUDY BLUEPRINT

Para permitir que o ecossistema de professor e aluno se conecte sem vazamento de prova, criar conceito semelhante a:

Assessment

contém informações privadas.

AssessmentQuestion

contém questão real.

AssessmentAnswer

contém resposta/gabarito.

Essas entidades são estritamente privadas.

Separadamente poderá existir:

StudyBlueprint

contendo apenas informação pedagógica sanitizada.

Exemplo:

- Integrais de superfície
- Teorema de Green
- Teorema de Stokes
- Teorema da Divergência

Competências:

- interpretação;
- resolução;
- aplicação.

Dificuldade:

intermediária.

O StudyBlueprint NÃO pode permitir reconstruir questões reais.

Esse recurso deverá ser:

- explicitamente controlado;
- auditável;
- igual para alunos elegíveis da mesma turma;
- configurável pelo professor/instituição.

Nunca criar "informação privilegiada secreta" para determinados alunos.

A arquitetura precisa tratar esse problema como requisito de segurança central.

---

# 12. DOCUMENTOS E RAG

Quando um PDF for enviado:

Arquivo original

↓

Storage

↓

registro Document

↓

fila de processamento

↓

extração de texto

↓

normalização

↓

detecção de páginas

↓

chunking

↓

embeddings

↓

PostgreSQL/pgvector.

Armazenar algo semelhante a:

documents

document_pages

document_chunks

O chunk deverá conter pelo menos:

- id;
- document_id;
- page;
- position;
- content;
- token_count;
- embedding;
- metadata;
- created_at.

Não definir esse schema cegamente.

Analise normalização e desempenho.

Ao responder perguntas, aplicar RAG.

Fluxo:

pergunta

↓

embedding

↓

busca vetorial

↓

filtros de permissão

↓

reranking, se necessário

↓

context builder

↓

LLM.

REGRA CRÍTICA:

A busca vetorial deve aplicar permissões antes de o contexto chegar ao modelo.

Nunca recupere chunks privados para depois pedir ao modelo para "não falar deles".

---

# 13. CHAT E CONTEXTO

O chat com IA deverá suportar diferentes contextos.

Exemplos:

Chat geral.

Chat sobre documento.

Chat sobre disciplina.

Chat de revisão.

Chat de criação de avaliação.

Chat de tutor acadêmico.

Modelar:

Conversation

Message

ConversationContext

AIUsage

Não armazenar contexto gigantesco indefinidamente sem estratégia.

Planejar:

- janela de contexto;
- sumarização de conversas;
- recuperação de mensagens;
- persistência.

---

# 14. AI GATEWAY

Criar uma abstração central para qualquer provedor de IA.

Nenhuma regra importante do sistema deve depender diretamente de SDK específico.

Criar interface conceitual semelhante a:

AIProvider

com capacidades como:

generateText()

generateStructured()

chat()

createEmbedding()

healthCheck()

getModels()

estimateUsage()

Posteriormente poderão existir:

OllamaCloudProvider

PlatformAIProvider

Outros provedores.

O restante da aplicação deverá utilizar serviços internos e não importar diretamente SDKs dos provedores.

---

# 15. OLLAMA CLOUD

IMPORTANTE:

O produto pretende permitir que o próprio usuário forneça credenciais/API key de sua conta Ollama Cloud.

Considere isso uma integração cloud.

NÃO considere Ollama local como requisito inicial.

UX sugerida:

Configurações

↓

Inteligência Artificial

↓

Conectar provedor

↓

Ollama Cloud

↓

API Key.

A chave deverá ser:

- armazenada criptografada;
- nunca exibida novamente integralmente;
- nunca enviada ao frontend depois de armazenada;
- nunca registrada em logs;
- mascarada;
- rotacionável;
- removível;
- testável por health-check.

Criar um CredentialsVault ou abstração semelhante.

Nunca armazenar API key em plaintext.

---

# 16. IA DA PLATAFORMA

Usuários de planos superiores poderão usar IA fornecida pela própria plataforma.

O usuário não precisará cadastrar API key.

O AI Gateway deverá selecionar o provedor baseado em:

- plano;
- configuração;
- disponibilidade;
- operação;
- quotas.

Exemplo conceitual:

UserAIContext

↓

AIProviderResolver

↓

OllamaCloudProvider

ou

PlatformAIProvider.

---

# 17. MODELO FREEMIUM E PLANOS

Planejar quatro planos.

Os nomes e preços definitivos ainda NÃO estão decididos.

Portanto:

não espalhar preços hardcoded no sistema.

Criar Plans/Entitlements configuráveis.

Estrutura conceitual:

### Plano 1 — Free

R$ 0.

Usuário utiliza a plataforma com limitações diárias.

Para funcionalidades de IA, poderá conectar sua própria conta Ollama Cloud.

A plataforma não deverá necessariamente fornecer gratuitamente toda a capacidade de IA.

Possíveis limites:

- sessões diárias;
- quantidade de documentos;
- quantidade de materiais;
- quantidade de gerações;
- armazenamento;
- avaliações.

Os valores deverão ser configuráveis.

### Plano 2 — BYOK / Individual

Plano pago de valor baixo.

Usuário utiliza sua própria IA via Ollama Cloud.

A limitação da plataforma é removida ou substancialmente aumentada.

Esse plano deverá suportar futuramente sistema de descontos relacionado a integrações elegíveis.

### Plano 3 — Premium

Usuário utiliza a IA da própria plataforma.

Não precisa configurar provedor externo.

Limites muito superiores.

Pode incluir:

- RAG;
- simulados;
- geração de materiais;
- geração de avaliações;
- exportações;
- maior storage.

### Plano 4 — Professor Pro / Institucional

Voltado principalmente a professores, power users e futuramente instituições.

Poderá incluir:

- mais turmas;
- mais armazenamento;
- geração avançada de avaliações;
- versões de provas;
- analytics;
- maior quota;
- funcionalidades administrativas.

A nomenclatura final deverá ser proposta pelo agente.

---

# 18. DESCONTOS RELACIONADOS A API KEYS

Existe uma ideia comercial experimental:

No Plano 2, usuários poderão eventualmente fornecer integrações/chaves elegíveis e receber percentual de desconto.

Exemplo conceitual:

5% de desconto por integração elegível.

O desconto poderá ser cumulativo.

Poderá existir teto configurável.

NÃO hardcode:

5%.

NÃO hardcode:

100%.

Criar DiscountRule configurável.

IMPORTANTE:

Existe interesse futuro em permitir que capacidade ociosa associada a integrações fornecidas voluntariamente pelo usuário possa gerar benefícios comerciais.

Entretanto:

**NÃO IMPLEMENTE REUTILIZAÇÃO, POOLING OU COMPARTILHAMENTO DE API KEYS SEM ANTES VALIDAR FORMALMENTE OS TERMOS DE SERVIÇO DO PROVEDOR.**

O agente deverá tratar isso como requisito bloqueado por compliance.

Não assumir que:

- múltiplas contas são permitidas para aumentar quota;
- uma chave pode ser compartilhada;
- uma credencial pode ser utilizada para outros clientes;
- uma chave pode ser usada em outros projetos;
- capacidade gratuita pode ser revendida.

Antes de implementar qualquer mecanismo desse tipo:

1. consultar documentação oficial atual do provedor;
2. verificar termos de serviço;
3. verificar limites;
4. verificar permissões de credential sharing;
5. verificar uso comercial;
6. verificar política contra abuso de múltiplas contas.

Se não existir autorização clara:

NÃO implementar pooling de keys.

Implementar somente BYOK individual.

O sistema de descontos poderá continuar existindo associado a integrações válidas permitidas pelos provedores.

---

# 19. COBRANÇA

Criar arquitetura independente do gateway de pagamento.

Conceitos esperados:

Plan

Subscription

Entitlement

UsageLimit

UsageEvent

DiscountRule

Invoice

PaymentProvider

Não é necessário implementar gateway de pagamento na primeira entrega.

Mas o domínio deve estar preparado.

Nunca espalhar:

if (plan === "premium")

por todo o código.

Criar sistema de:

entitlements/capabilities.

Exemplo:

AI_PLATFORM_ACCESS

UNLIMITED_STUDY_SESSIONS

ASSESSMENT_GENERATION

DOCX_EXPORT

MAX_STORAGE_BYTES

MAX_DOCUMENTS

MAX_CLASSES.

---

# 20. CONTROLE DE USO DA IA

Toda operação de IA deve registrar métricas adequadas.

AIUsageEvent:

- user;
- provider;
- model;
- feature;
- input tokens;
- output tokens;
- estimated cost;
- latency;
- success;
- timestamp.

Nunca armazenar conteúdo sensível desnecessariamente em telemetria.

A plataforma deve futuramente conseguir calcular:

receita do usuário

versus

custo de IA daquele usuário.

Isso será fundamental para unit economics.

---

# 21. DESIGN DO FRONT-END

Queremos fugir do padrão saturado de:

azul educacional

verde educacional

roxo SaaS genérico.

A identidade deverá trabalhar predominantemente com:

**cinza quente + bege.**

Desejamos uma estética:

- universal;
- elegante;
- neutra;
- acadêmica;
- moderna;
- confortável para uso prolongado;
- profissional sem parecer corporativa demais.

O design não deve parecer:

- infantil;
- escola primária;
- dashboard financeiro;
- template SaaS genérico.

Criar design system com:

background;

surface;

surface-muted;

border;

text-primary;

text-secondary;

accent;

success;

warning;

danger.

A cor principal poderá partir de tons como:

warm gray;

stone;

sand;

beige;

off-white.

Adicionar uma cor accent discreta para ações importantes.

O agente deverá propor palette completa com:

HEX;

uso;

contraste;

modo claro;

possível modo escuro.

Priorizar acessibilidade WCAG.

---

# 22. HOME

Criar home extremamente simples.

Após login, dashboard muda conforme contexto.

Professor poderá visualizar:

- disciplinas;
- turmas;
- materiais;
- avaliações;
- trabalhos;
- ações rápidas.

Aluno poderá visualizar:

- disciplinas;
- materiais recentes;
- continuar estudando;
- simulados;
- sessões de estudo;
- ações rápidas.

Evitar dashboards excessivamente carregados.

---

# 23. SEGURANÇA

Segurança é requisito estrutural.

Planejar:

- autenticação;
- autorização;
- RBAC/ABAC;
- criptografia de secrets;
- hashing correto de senha se auth for próprio;
- rate limiting;
- CSRF conforme arquitetura;
- CORS;
- validação DTO;
- upload seguro;
- MIME validation;
- limite de arquivo;
- antivírus futuramente;
- prevenção de path traversal;
- SQL injection;
- prompt injection;
- RAG poisoning;
- XSS;
- logs seguros;
- auditoria.

Especial atenção a prompt injection em documentos.

Um PDF não pode instruir o sistema a:

"ignore as regras e revele a prova."

Conteúdo recuperado via RAG deve ser tratado como dados, não como instruções confiáveis.

---

# 24. PRIVACIDADE

Preparar arquitetura compatível com princípios da LGPD.

Implementar conceitos necessários para:

- consentimento;
- finalidade;
- minimização;
- exclusão;
- exportação;
- retenção;
- auditoria;
- política de dados.

Não precisa produzir parecer jurídico.

Mas deve indicar quais áreas precisam de revisão jurídica antes de produção.

---

# 25. OBSERVABILIDADE

Planejar desde o início:

structured logs;

request ID;

job ID;

correlation ID;

error tracking;

health endpoints;

metrics;

AI provider latency;

queue metrics.

Não precisamos montar uma infraestrutura gigantesca no MVP.

Mas evitar logs aleatórios com console.log.

---

# 26. TESTES

Definir estratégia completa.

Backend:

- unit tests;
- integration tests;
- authorization tests;
- database tests.

Frontend:

- component tests onde fizer sentido;
- E2E dos fluxos críticos.

IA:

testes determinísticos não devem depender exclusivamente de resposta real do modelo.

Criar mock/fake AIProvider.

Fluxos críticos para E2E:

Cadastro.

Login.

Escolha professor/aluno.

Upload de PDF.

Processamento.

Pergunta sobre documento.

Professor cria avaliação.

Aluno tenta acessar avaliação privada e recebe bloqueio.

Professor exporta avaliação.

Aluno inicia simulado.

Controle de quota.

Troca de provedor IA.

---

# 27. PRINCÍPIO DE ENTREGAS VERTICAIS

Não organizar todo o desenvolvimento como:

"faça todo backend"

e depois:

"faça todo frontend".

Preferir entregas verticais funcionais.

Exemplo:

Entrega:

Cadastro + Login.

Inclui:

DB

backend

frontend

testes.

Depois:

Disciplina.

Depois:

Upload.

Depois:

RAG.

Cada entrega deverá resultar em algo que eu, usuário/testador, consiga executar e verificar.

---

# 28. PRIMEIRA MISSÃO DO AGENTE

NESTA PRIMEIRA EXECUÇÃO:

**NÃO IMPLEMENTE AS FUNCIONALIDADES DO PRODUTO.**

Sua missão é produzir o planejamento técnico completo.

Você deverá primeiro:

1. analisar todos os requisitos;
2. identificar requisitos explícitos;
3. identificar requisitos implícitos;
4. identificar conflitos;
5. identificar decisões ainda abertas;
6. propor arquitetura;
7. definir domínios;
8. definir entidades;
9. definir relações;
10. definir contratos;
11. definir ordem de implementação.

Se o repositório já existir:

inspecione-o.

Informe:

- estrutura;
- tecnologias existentes;
- arquivos relevantes;
- dívida técnica;
- conflitos com esta arquitetura.

Não destrua trabalho existente.

---

# 29. DOCUMENTOS QUE DEVEM SER PRODUZIDOS

Produza documentação equivalente a:

docs/

ARCHITECTURE.md

DOMAIN_MODEL.md

DATABASE_PLAN.md

API_PLAN.md

AI_ARCHITECTURE.md

RAG_ARCHITECTURE.md

SECURITY.md

MONETIZATION.md

UI_UX.md

TEST_STRATEGY.md

IMPLEMENTATION_PLAN.md

SUBAGENT_PLAN.md

DECISIONS.md

Se ainda não existir repositório, apresente o conteúdo completo no planejamento antes de criar qualquer coisa.

---

# 30. ARCHITECTURE.md

Deve conter:

- visão geral;
- diagrama textual;
- responsabilidades;
- fronteiras;
- monólito modular;
- frontend;
- backend;
- worker;
- banco;
- storage;
- filas;
- IA;
- dependências;
- fluxo de requisição.

---

# 31. DOMAIN_MODEL.md

Definir módulos/domínios como candidatos:

Identity

Users

Organizations

Courses

Classes

Enrollments

Materials

Documents

Assessments

Assignments

Study

AI

Billing

Exports

Audit.

Para cada um:

Responsabilidade.

Entidades.

Value Objects.

Eventos.

Dependências permitidas.

Dependências proibidas.

---

# 32. DATABASE_PLAN.md

Propor tabelas.

Não precisa escrever migrations ainda.

Mas detalhar:

- colunas;
- tipos;
- FK;
- índices;
- unique constraints;
- soft delete ou não;
- timestamps;
- enum ou tabela;
- pgvector;
- ownership;
- tenancy.

Criar ERD textual.

---

# 33. API_PLAN.md

Definir endpoints iniciais.

Por exemplo:

/auth

/users

/courses

/classes

/materials

/documents

/assessments

/study

/ai

/subscriptions.

Para cada endpoint:

method;

path;

auth;

papel permitido;

request;

response;

erros esperados.

Não crie dezenas de endpoints sem necessidade.

---

# 34. AI_ARCHITECTURE.md

Definir:

AIProvider.

AIProviderResolver.

AIUsageService.

AIQuotaService.

PromptTemplateService.

StructuredGenerationService.

CredentialsVault.

Integração com Ollama Cloud.

Integração com IA da plataforma.

Fallback.

Retry.

Timeout.

Circuit breaker futuro.

---

# 35. RAG_ARCHITECTURE.md

Definir:

Document ingestion.

Parser.

Chunking.

Embeddings.

Vector search.

Authorization filters.

Metadata filtering.

Context builder.

Citation mechanism.

Prompt injection defense.

Reprocessing/versioning.

---

# 36. IMPLEMENTATION_PLAN.md

Esta será a parte MAIS IMPORTANTE.

O projeto deverá ser dividido em fases e entregas.

Cada entrega deverá possuir obrigatoriamente:

### Identificação

Exemplo:

E03 — Autenticação e Perfil.

### Objetivo

Resultado concreto da entrega.

### Dependências

Exemplo:

depende de E01 e E02.

### Backend

Arquivos/módulos que serão criados.

### Frontend

Páginas/componentes.

### Banco

Tabelas/migrations.

### API

Endpoints.

### Testes

Testes necessários.

### Critério de aceite

Como eu verificarei manualmente.

### Definição de pronto

Condição objetiva.

### Riscos

Possíveis problemas.

### Não fazer nesta entrega

Para controlar escopo.

---

# 37. FASES ESPERADAS

Analise e melhore esta sequência:

Fase 0 — arquitetura e decisões.

Fase 1 — bootstrap/monorepo.

Fase 2 — infraestrutura local.

Fase 3 — autenticação e usuário.

Fase 4 — disciplinas/turmas.

Fase 5 — storage e upload.

Fase 6 — processamento de documentos.

Fase 7 — pgvector e RAG.

Fase 8 — AI Gateway.

Fase 9 — tutor acadêmico.

Fase 10 — módulo do professor.

Fase 11 — avaliação.

Fase 12 — StudyBlueprint.

Fase 13 — simulados.

Fase 14 — exportação.

Fase 15 — planos/entitlements.

Fase 16 — integração Ollama Cloud.

Fase 17 — IA da plataforma.

Fase 18 — observabilidade.

Fase 19 — segurança.

Fase 20 — PWA/polimento.

Você pode reordenar quando houver dependências melhores.

---

# 38. QUATRO SUBAGENTES

Depois do planejamento, o projeto será desenvolvido por quatro agentes.

Você deverá criar um plano explícito para eles.

Sugestão inicial:

## SUBAGENTE A — Frontend / UX

Responsável por:

Next.js;

design system;

layout;

rotas;

componentes;

forms;

dashboards;

experiência aluno/professor;

integração HTTP.

## SUBAGENTE B — Backend / Domínio

Responsável por:

NestJS;

domínios;

REST API;

PostgreSQL;

autenticação;

autorização;

business rules.

## SUBAGENTE C — IA / RAG / Documentos

Responsável por:

AI Gateway;

Ollama Cloud;

embeddings;

pgvector;

RAG;

parser;

chunking;

workers de IA.

## SUBAGENTE D — Infraestrutura / QA / Segurança

Responsável por:

Docker;

PostgreSQL;

Redis;

storage;

queues;

CI;

testes E2E;

observabilidade;

segurança;

deploy.

Você deverá revisar essa divisão.

Evite que dois agentes editem constantemente os mesmos arquivos.

Defina ownership.

---

# 39. CONTRATOS ANTES DO PARALELISMO

Antes de liberar os quatro agentes:

defina contratos compartilhados.

Exemplo:

DTOs;

OpenAPI;

database schema;

event payloads;

environment variables;

ports;

naming conventions.

Subagentes não devem inventar contratos incompatíveis.

---

# 40. DEPENDENCY GRAPH

Crie grafo explícito.

Exemplo:

E01

↓

E02

↓

E03

↙   ↘

E04   E05

...

Identifique quais entregas podem acontecer paralelamente.

---

# 41. PROTOCOLO DE TRABALHO DOS SUBAGENTES

Cada subagente deverá receber:

Contexto.

Objetivo.

Escopo.

Arquivos que pode alterar.

Arquivos que não deve alterar.

Dependências.

Contrato.

Testes.

Critério de aceite.

Comandos de validação.

Não envie prompt vago como:

"faça o frontend".

Produza prompts operacionais.

---

# 42. INTEGRAÇÃO

Defina momentos de integração.

Exemplo:

Integration Gate 1

Auth funcionando.

Integration Gate 2

Course CRUD funcionando.

Integration Gate 3

Document ingestion.

Integration Gate 4

RAG.

Integration Gate 5

Assessment.

Para cada Gate:

comandos;

testes;

verificações.

---

# 43. GIT

Proponha workflow simples.

Evitar Git Flow excessivamente complexo.

Preferência:

main

develop opcional

feature/<entrega>

Cada entrega deve possuir commits pequenos.

Subagentes devem evitar commits gigantescos.

Não fazer merge quando testes estiverem quebrados.

---

# 44. AMBIENTE LOCAL

Planejar execução local simples.

Objetivo futuro:

um comando semelhante a:

docker compose up -d

e:

pnpm dev.

Docker Compose poderá subir:

PostgreSQL + pgvector

Redis

serviços auxiliares.

Web/API poderão rodar localmente durante desenvolvimento.

---

# 45. .ENV

Definir env vars necessárias.

Exemplo conceitual:

DATABASE_URL

REDIS_URL

APP_SECRET

ENCRYPTION_KEY

STORAGE_PATH

OLLAMA_CLOUD_BASE_URL

PLATFORM_AI_PROVIDER

PLATFORM_AI_API_KEY.

Nunca commitar secrets.

Criar:

.env.example.

---

# 46. VERSIONAMENTO DE PROMPTS

Prompts importantes da IA devem ser versionados.

Não espalhar grandes strings de prompt aleatoriamente pelo código.

Criar estratégia de templates.

Guardar:

name;

version;

purpose.

Permitir rastrear qual prompt gerou determinada avaliação.

---

# 47. PROVENIÊNCIA

Para respostas baseadas em material acadêmico, preparar mecanismo de citação.

Exemplo:

"A definição aparece no material Aula 04, página 17."

Guardar relação entre:

resposta;

document;

chunk;

page.

Isso aumenta confiança e auditabilidade.

---

# 48. AVALIAÇÕES GERADAS

Guardar proveniência da geração.

Exemplo:

AssessmentGeneration

provider;

model;

promptVersion;

materials;

createdAt.

Não necessariamente salvar todo prompt com dados sensíveis.

Mas permitir auditoria.

---

# 49. ESTADOS

Avaliar state machines simples.

Assessment:

DRAFT

READY

PUBLISHED

ARCHIVED.

Document:

UPLOADED

PROCESSING

READY

FAILED.

AI Job:

QUEUED

RUNNING

SUCCEEDED

FAILED.

Subscription:

ACTIVE

CANCELED

PAST_DUE.

Não usar strings soltas sem modelagem.

---

# 50. ERROS

Definir error model consistente.

Exemplo:

code

message

details

requestId.

Frontend não deve depender de mensagens textuais arbitrárias.

---

# 51. RESULTADO FINAL ESPERADO DESTA PRIMEIRA EXECUÇÃO

Ao final desta primeira execução, NÃO quero ainda o Facilita Estudo implementado.

Quero possuir um documento de engenharia tão completo que quatro agentes consigam começar o desenvolvimento com mínima ambiguidade.

Sua resposta final deverá conter obrigatoriamente:

1. Resumo executivo do sistema.

2. Decisões arquiteturais.

3. Stack final recomendada.

4. Estrutura do monorepo.

5. Domínios.

6. Modelo de dados.

7. Arquitetura de IA.

8. Arquitetura RAG.

9. Segurança.

10. Monetização.

11. Design system.

12. Roadmap completo.

13. Entregas numeradas.

14. Dependency graph.

15. Distribuição entre quatro subagentes.

16. Prompts detalhados para os quatro subagentes.

17. Integration Gates.

18. Test Strategy.

19. Definition of Done global.

20. Riscos técnicos.

21. Decisões que ainda precisam ser validadas.

---

# 52. NÍVEL DE DETALHE

Não responda coisas genéricas como:

"Configure o banco."

Escreva:

"Na entrega E02, criar PostgreSQL com extensão pgvector através de Docker Compose. Criar migration inicial. Adicionar health check no backend. Criar conexão usando X. Criar `.env.example`. Testar reinicialização do container preservando volume."

Não diga:

"Crie autenticação."

Detalhe:

fluxo;

tokens;

cookies;

guards;

tabelas;

endpoints;

frontend;

erros;

testes.

Não diga:

"Faça integração com IA."

Detalhe:

interfaces;

resolver;

provider;

DTO;

schema;

timeout;

retries;

usage tracking;

credential storage;

failure modes.

---

# 53. REGRA ANTI-ALUCINAÇÃO

Quando alguma tecnologia, API ou comportamento de serviço externo for relevante:

NÃO invente.

Consulte documentação oficial atual quando necessário.

Especialmente:

Ollama Cloud;

limites;

autenticação;

modelos;

billing;

API;

termos;

rate limits.

Diferencie:

FATO VERIFICADO

de

DECISÃO NOSSA

de

HIPÓTESE.

Se algo ainda precisar ser validado, marque explicitamente:

`VALIDAÇÃO NECESSÁRIA`.

---

# 54. REGRA DE COMPLEXIDADE

Não faça overengineering.

Não introduza:

Kubernetes;

Kafka;

microserviços;

service mesh;

event sourcing;

CQRS completo;

GraphQL;

múltiplos bancos;

sem necessidade concreta.

A arquitetura inicial deve ser capaz de rodar em:

um servidor;

PostgreSQL;

Redis;

storage;

web;

API;

worker.

Escalar depois.

---

# 55. REGRA DE QUALIDADE

O projeto precisa ser:

legível;

tipado;

testável;

documentado;

modular;

seguro;

observável.

Priorize clareza acima de abstrações sofisticadas.

---

# 56. PRIMEIRA RESPOSTA

Comece sua resposta com:

**"Planejamento Mestre — Facilita Estudo"**

Depois apresente:

### A. Entendimento do produto

### B. Pontos que precisam de decisão

### C. Arquitetura proposta

### D. Modelo de domínio

### E. Modelo de dados

### F. Arquitetura de IA

### G. RAG

### H. Segurança

### I. UX

### J. Monetização

### K. Roadmap de entregas

### L. Grafo de dependências

### M. Divisão dos quatro subagentes

### N. Integration Gates

### O. Testes

### P. Riscos

### Q. Próxima ação recomendada

Se você possuir acesso ao repositório, antes de finalizar compare o plano proposto com a estrutura real encontrada.

Nesta primeira fase, **não comece a implementação antes de concluir o planejamento mestre.**