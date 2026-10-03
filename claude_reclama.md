# Pontos de melhoria — Facilita Estudo

Levantamento feito em 03/10/2026 a partir da revisão das telas (Início, Disciplinas, Conversas, Meus estudos, Avaliações, Configurações) e dos problemas encontrados durante o trabalho na home, no login/cadastro, em Plano e consumo e em Configurações › IA.

Ordem de prioridade: **estabilidade → produto → interface → código**. Os itens 1, 5 e 6 são os mais urgentes: sem eles, a primeira experiência de quem chega é "a IA não funciona e ninguém sabe por quê".

---

## 1. Estabilidade

### 1.1 Worker trava sem ninguém perceber
- **O que aconteceu:** o worker do `npm run dev` ficou preso. Todas as tarefas (verificação de chave, gerações) ficaram em `QUEUED` e nenhum `outbox_event` foi despachado (`attempts = 0`). O `node --watch` também não reiniciou o processo depois de mudanças no código. Um worker novo processou a fila na hora.
- **Por que importa:** a tela mostra "Trabalhando no seu pedido" para sempre e nada avisa que existe um problema.
- **Sugestão:**
  - log de inicialização e de "estou vivo" no worker (`backend/src/worker.ts`, `JobRunnerService.start`);
  - rota `/health` que informe a idade da tarefa mais antiga na fila;
  - aviso na interface quando uma tarefa passar de ~1 min em `QUEUED` ("O processamento está demorando. Tente de novo em instantes.").

### 1.2 Configuração não é validada na inicialização
- **O que aconteceu:** o `.env`, o `.env.example` e a documentação usavam `AI_PROVIDER=ollama`, mas o código só aceitava `ollama-cloud`. Toda verificação de chave e a lista de modelos falhavam com `PROVIDER_NOT_CONFIGURED`. **Corrigido** (`ai.service.ts` aceita os dois valores).
- **Sugestão:** validar as variáveis obrigatórias com zod ao subir a API e o worker, e recusar a inicialização com uma mensagem clara se algo estiver inválido.

### 1.3 Contrato da API diverge do que o frontend espera
- **O que aconteceu:** o `JobTracker` esperava receber o job direto em `GET /jobs/:id`, mas o backend responde `{ job: {...} }`. Resultado: `Cannot read properties of undefined (reading 'toLowerCase')`, que quebrava o acompanhamento de **todas** as tarefas (materiais, estudo, avaliações, exportação, IA). **Corrigido** em `front-end/components/job-tracker.tsx`.
- **Sugestão:** gerar os tipos e o cliente do frontend a partir do OpenAPI que já existe (`backend/src/contracts/openapi.ts`). Isso elimina essa classe de bug.

### 1.4 `localhost` × `127.0.0.1` em desenvolvimento
- **O que aconteceu:** `APP_ORIGIN=http://localhost:3000`. Acessando por `http://127.0.0.1:3000`, cadastro e login falham com "A sessão mudou. Atualize a página e tente de novo." (`CSRF_INVALID`, checagem de origem em `session.guard.ts`).
- **Sugestão:** em desenvolvimento, aceitar uma lista de origens (`localhost` e `127.0.0.1`), ou documentar isso no `LOCAL_DEVELOPMENT.md`.

### 1.5 Verificação de chave aprovava qualquer chave
- **O que aconteceu:** o teste de saúde da Ollama só chamava `/api/tags`, que é público e responde 200 até com chave falsa. **Corrigido:** a verificação agora usa `POST /api/me`, que recusa chave inválida com 401 e não gasta tokens (`ollama-cloud.provider.ts`, com testes em `backend/tests/unit/ollama-health.test.ts`).
- **Atenção:** `/api/me` e `/api/usage` não estão na documentação pública da Ollama. Se mudarem, a verificação passa a mostrar "Indisponível" (nunca uma falsa aprovação). Vale acompanhar.

---

## 2. Produto

### 2.1 O plano Livre não entrega o principal
- O card do Livre promete "Perguntas com fonte" (`RAG_ACCESS = true`), mas `DAILY_GENERATIONS = 0`. Toda resposta da IA consome uma geração, então quem acaba de se cadastrar provavelmente não consegue conversar com os materiais.
- **Decisão pendente:** liberar algumas gerações por dia no Livre (sugestão: 5 a 10) **ou** tirar "Perguntas com fonte" da divulgação do Livre (home e Configurações › Plano).

### 2.2 Falta um caminho de primeiros passos
- A pessoa nova cai num Início vazio, e nada de IA funciona até conectar uma chave, o que ela não tem como saber.
- **Sugestão:** checklist no Início, com cada item marcado ao concluir:
  1. Conectar IA
  2. Criar disciplina
  3. Enviar material
  4. Fazer a primeira pergunta

### 2.3 Conversas com atrito desnecessário
- Hoje é preciso preencher título e disciplina e clicar "Abrir conversa" antes de perguntar qualquer coisa.
- **Sugestão:** abrir direto numa caixa "Pergunte algo…", criar a conversa no primeiro envio e gerar o título automaticamente.

### 2.4 Meus estudos e Simulados dependem de formulário
- São formulários de selects soltos (disciplina, tipo, materiais).
- **Sugestão:** levar essas ações para dentro da disciplina ou do material: "Gerar resumo deste PDF", "Criar simulado deste capítulo".

### 2.5 Lista de modelos aparece mesmo sem chave válida
- A lista vem de `ollama.com/api/tags`, que é público. Ela aparece mesmo com a chave recusada, e escolher um modelo ali não garante que a conta consiga usá-lo.
- **Opções:** mostrar a lista só com uma chave verificada, e/ou trocar os ~20 modelos crus por 3 ou 4 recomendados com nome amigável ("Rápido", "Mais preciso", "Bom para código").

### 2.6 Várias chaves × regra da Ollama e do projeto
- A troca automática entre várias chaves Ollama foi implementada a pedido. A Ollama exige **"uma conta por pessoa"**, e o `docs/MONETIZATION.md` proíbe usar várias contas para ampliar a cota ("somente BYOK individual").
- O código não bloqueia chaves de contas diferentes; a tela só avisa "Use apenas chaves da sua própria conta Ollama".
- **Decisão pendente:** atualizar o `MONETIZATION.md` permitindo várias chaves da mesma pessoa, **ou** restringir a troca automática a chaves da mesma conta. A segunda opção ainda precisa ser confirmada com uma chave válida: provavelmente dá para identificar a conta pelo `/api/me`.

---

## 3. Interface e textos

### 3.1 Textos técnicos crus na tela
- Já corrigidos nas telas que foram refeitas: `UNVERIFIED`, `AI_CONNECTION_CHECK`, códigos de erro em jobs, `MAX_STORAGE_BYTES`, JSON de limites nos planos.
- **Sugestão:** revisar as demais telas (materiais, turmas, avaliações, exportações) atrás de códigos e enums que ainda aparecem para o usuário. Centralizar os textos, como já foi feito em `lib/plan-catalog.ts` e `lib/api.ts` (`errorMessages`).

### 3.2 Textos genéricos que soam "de IA"
- Slogans e frases vagas ainda aparecem fora da home: "Um passo de cada vez, no seu ritmo." no menu lateral, e telas vazias com ✳ e frases como "Sua próxima pergunta começa aqui".
- **Sugestão:** uma tela vazia deve dizer o que fazer e por quê, de forma concreta (ex.: "Envie um PDF ou PPTX para começar a fazer perguntas sobre ele.").

### 3.3 Letras pequenas demais
- O `front-end/app/globals.css` tem muitos tamanhos entre 9 e 11px (tags, abas, legendas, metadados). Prejudica a leitura, principalmente no celular.
- **Sugestão:** mínimo de 12px para qualquer texto lido pelo usuário.

---

## 4. Código e manutenção

### 4.1 `globals.css` difícil de manter
- Muitas regras escritas numa linha só, com mais de 1.000 caracteres cada.
- Começou a separação por tela (`app/landing.css`, `app/app/configuracoes/plano/plan.css`). Vale terminar.
- Decidir se o Tailwind (instalado, mas quase sem uso) fica ou sai.

### 4.2 Poucos testes de ponta a ponta
- Só existe `front-end/tests/e2e/account.spec.ts`.
- **Faltam os fluxos principais:** cadastrar → conectar chave → enviar PDF → perguntar → gerar resumo → gerar avaliação → exportar.

### 4.3 Documentação desatualizada
- `docs/MONETIZATION.md` × troca automática de chaves (ver 2.6).
- `docs/LOCAL_DEVELOPMENT.md`: incluir a questão de origem (1.4) e como reiniciar o worker (1.1).

---

## Pendências desta rodada de trabalho

- [ ] **Reiniciar o `npm run dev` do backend.** O worker atual continua travado (ver 1.1).
- [ ] **Testar com uma chave Ollama real:** o "restam X%" vindo da Ollama, a troca automática numa geração de verdade e o aviso de uso depois de cada geração. Testes unitários e de integração passam, mas esse fluxo não foi exercitado com uma chave válida.
- [ ] **Limpar a conta de teste "Ana Teste"** (e-mails `home-teste-…@example.com`) no banco local. Ela tem duas chaves falsas marcadas como verificadas com uso simulado.
- [ ] **Rotacionar a chave do cofre local** (`VAULT_KEYS_JSON` no `backend/.env`) caso ela seja usada fora do ambiente local: o valor foi exibido no log de uma sessão de trabalho.
- [ ] **Decidir 2.1** (plano Livre) **e 2.6** (várias chaves × regra de uma conta por pessoa).
