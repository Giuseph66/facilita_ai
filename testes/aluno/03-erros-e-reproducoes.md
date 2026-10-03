# 03 — Erros, divergências e reproduções

## A-01 — Autofill heurístico na configuração de IA

- **Tela:** `/app/configuracoes/ia`.
- **Fato:** o Chrome preencheu o nome e o campo secreto ao abrir a configuração de primeira chave numa conta QA. Após reabrir, os campos apareceram vazios e o navegador os preencheu depois. O valor secreto não foi lido; dados de conta anterior não foram reproduzidos nem salvos.
- **Impacto possível:** quem configura uma conta nova pode confirmar um valor autofillado sem notar.
- **Classificação:** informativa / navegador; coordenação não encontrou evidência de vazamento pelo serviço. Não é defeito confirmado do produto.
- **Reprodução:** em perfil Chrome com autofill existente, abrir a configuração de IA de outra conta e observar os campos antes de salvar.

## A-02 — Início do tutor retorna validação genérica

- **Tela:** `/app/conversas`.
- **Esperado:** indicação clara do que falta ou criação de uma conversa se título e contexto opcionais estiverem vazios/escolhidos conforme indicado.
- **Observado:** após preencher “Título (opcional)” e clicar “Abrir conversa” com “Sem contexto de disciplina”, apareceu **“Ação não concluída — Confira os campos destacados e tente novamente”**. A árvore de acessibilidade não destacou campo; nenhuma conversa apareceu em recentes.
- **Impacto:** estudante não sabe se falta contexto/material, entitlement ou outro campo; impede distinguir erro de UX de regra funcional.
- **Severidade:** P2 se reproduzível com disciplina/material acessível; por ora causa inconclusiva, observada no plano inicial Livre.
- **Reprodução:** entrar como aluno QA → Conversas → preencher o título opcional → manter “Sem contexto de disciplina” → Abrir conversa.
- **Reteste:** não executado depois da mudança temporária de entitlement porque o conteúdo não estava disponível e o usuário encerrou novos testes.

## A-03 — Painel inicial não reflete matrícula

- **Telas:** `/app` e `/app/turmas`.
- **Esperado:** painel incluir a turma em que o aluno já está matriculado.
- **Observado:** Turmas mostrava “Turma QA Fotossíntese”; após logout/login, `/app` ainda mostrava **“Ainda sem turmas”** e **“Seu espaço está pronto”**.
- **Impacto:** estudante pode acreditar que perdeu matrícula ou que não tem acesso; atalhos para a turma somem do painel.
- **Severidade:** P2.
- **Natureza provável:** discrepância de consulta/escopo ou atualização de contexto; causa não confirmada pelo teste visual.
- **Reprodução:** aceitar convite → conferir `/app/turmas` → sair/entrar → abrir `/app` e aguardar carregamento.

## A-04 — Disciplina da turma ausente da lista, mas acessível por rota direta

- **Telas:** `/app/disciplinas` e `/app/disciplinas/1711c131-9648-4972-89f0-7711c42f9a48`.
- **Esperado:** disciplina acessível por matrícula aparecer na lista e permitir navegação normal.
- **Observado:** `/app/disciplinas` dizia **“Ainda sem disciplinas”**. A rota de detalhe já observada na jornada docente carregou “Biologia QA 20261003”, descrição e quatro tópicos. O detalhe dizia **“Sem materiais por enquanto”**; resumo/cartões/plano/simulado estavam desabilitados.
- **Impacto:** o estudante precisa conhecer a URL para chegar a uma disciplina que a interface direta parece permitir abrir.
- **Severidade:** P2.
- **Natureza provável:** divergência de contexto/workspace entre lista e detalhe. A coordenação levantou como hipótese que as telas podem filtrar espaços de forma diferente; isso é inferência, não confirmação por este teste.
- **Reprodução:** aceitar convite → confirmar turma em Turmas → abrir lista de disciplinas → notar estado vazio → abrir a rota conhecida → comparar.

## A-05 — Feedback contraditório na exportação dos próprios dados

- **Tela:** `/app/configuracoes/privacidade`.
- **Esperado:** um único estado coerente após a solicitação.
- **Observado:** depois de uma solicitação pela UI, apareceram simultaneamente o aviso vermelho **“Pedido não enviado — Não foi possível conectar ao serviço”** e o verde **“Pedido registrado”**. A lista persistida mostrou exportação concluída e link “Baixar cópia”; o evento de download ocorreu. O arquivo não foi aberto.
- **Impacto:** estudante pode repetir uma solicitação já concluída ou duvidar do status.
- **Severidade:** P2 em fluxo de privacidade.
- **Natureza:** feedback/estado contraditório. A origem do aviso de falha não foi comprovada visualmente.
- **Reprodução:** abrir Privacidade e dados → confirmar com senha própria → solicitar exportação uma vez → comparar avisos e lista de pedidos.

## A-06 — Overflow horizontal na tela de privacidade móvel

- **Tela:** `/app/configuracoes/privacidade`, viewport emulado 390 × 844 px, depois de haver uma solicitação recente.
- **Esperado:** página caber na largura do celular; chips de configuração podem rolar dentro da própria faixa.
- **Observado:** havia barra horizontal do documento; `innerWidth=390`, `documentElement.scrollWidth=452`. A seção de solicitações recentes mediu `clientWidth=341` e `scrollWidth=435`; um cartão interno `307/418`. A faixa de configurações rolável mediu `375/558` e foi tratada separadamente como comportamento intencional.
- **Impacto:** conteúdo de privacidade fica parcialmente fora da tela e a pessoa precisa rolar lateralmente.
- **Severidade:** P2 no estado com exportação recente; origem exata do elemento que alarga a seção não confirmada.
- **Reprodução:** abrir em largura 390 px → solicitar exportação QA → observar seção “Solicitações recentes” e largura do documento.

## A-07 — Exportação de avaliação permanece “trabalhando” na UI

Este achado pertence ao apoio temporário à jornada docente e está separado da avaliação do aluno em [apoio à jornada docente](07-apoio-jornada-docente.md). A coordenação relatou jobs export concluídos, mas no Chrome o status visual de prova PDF permaneceu “Trabalhando no seu pedido” por 30 s e nenhum link/download foi apresentado. Não é possível concluir que o worker falhou; o problema observado é que a UI não confirmou o resultado no prazo.

## A-08 — Relato de envio do PDF diverge do estado observado

Este registro não declara sucesso nem falha da aplicação. O usuário informou que selecionou e enviou o PDF; a disciplina QA observada pelo agente continuou mostrando “Sem materiais por enquanto”, sem ID/job/link, inclusive depois de recarga. A tentativa assistida de arquivo pelo agente havia sido recusada pela extensão Chrome antes de submeter. Ver detalhes em [apoio à jornada docente](07-apoio-jornada-docente.md).
