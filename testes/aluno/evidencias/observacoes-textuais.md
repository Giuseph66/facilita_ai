# Evidência textual consolidada

Transcrição de estados observados em 2026-10-03. Os textos entre aspas correspondem à interface; segredos e o dado autofillado de outra conta foram omitidos.

## Estados de turma e disciplina

- `/app/turmas`: lista exibiu **Turma QA Fotossíntese**, período 2026/2; permaneceu após sair e entrar novamente.
- `/app`: exibiu “Seu espaço está pronto” e “Ainda sem turmas”, mesmo com a turma presente na lista.
- `/app/turmas/{id}`: “Sem materiais visíveis nesta turma” e “Roteiro ainda não publicado”. A UI dizia que só conteúdos liberados aparecem.
- `/app/disciplinas`: “Ainda sem disciplinas”.
- Rota observada do detalhe QA: exibiu “Biologia QA 20261003”, com os tópicos “Cloroplastos e clorofila”, “Fase luminosa e ciclo de Calvin”, “Fatores limitantes” e “Fotossíntese e respiração”. Também exibiu “Sem materiais por enquanto”; resumo, cartões, plano e simulado estavam desabilitados.

## Tutor e estudo

- Tentativa de início de conversa: **“Ação não concluída — Confira os campos destacados e tente novamente”**; nenhum campo ficou destacado na árvore AX e nenhuma conversa apareceu em recentes.
- `/app/estudo`: seletor de disciplina sem opções; tipos incluíam resumo, cartões, plano, revisão e exercícios semelhantes; botão “Criar material” desativado.
- `/app/simulados`: seletor de disciplina sem opções; “Gerar simulado” desativado; “Ainda sem simulados”.

## IA e plano

- Consulta de uso na configuração de IA: **“Mês: restam 100%”**. A linha da conexão aparecia como **“Não verificada”**. A coordenação depois relatou que os jobs QA de conexão foram concluídos `SUCCEEDED`; não existe evidência de rejeição de chave.
- Plano inicial: mensagem **“Seu plano não inclui gerações com IA”**, uso inicial `0 de 10` conversas diárias e geração não incluída. Outros planos estavam marcados “Em breve”. O entitlement foi alterado temporariamente pela coordenação para reteste e restaurado para `FREE` sem cobrança.

## Privacidade e dados

- A UI informava que a exportação seria protegida e apresentaria andamento. Depois do pedido QA, mostrou simultaneamente o aviso vermelho **“Pedido não enviado — Não foi possível conectar ao serviço”** e o aviso verde **“Pedido registrado — Pedido de exportação registrado. O serviço informará quando a cópia segura estiver pronta.”**
- Solicitações recentes mostrou exportação **Concluído**, data 03/10/2026 e validade até 10/10/2026, com link **“Baixar cópia”**. Um evento de download foi confirmado; o arquivo não foi aberto.
- A prévia de exclusão exigiu texto de confirmação e senha. Foi cancelada; nenhum pedido de exclusão foi enviado.
- No viewport 390 px: `window.innerWidth=390`, `document.documentElement.scrollWidth=452`; seção de solicitações recentes `clientWidth=341`, `scrollWidth=435`; cartão interno `clientWidth=307`, `scrollWidth=418`; faixa de abas Configurações rolável `clientWidth=375`, `scrollWidth=558`.

## Upload docente observado a partir do mesmo Chrome

- A disciplina docente mostrava **“Sem materiais por enquanto”**. O formulário permitia nome, arquivo PDF/PPTX e classificação “Acadêmico · pode ser liberado por turma” ou “Secreto da docente · não pode ser compartilhado”; dizia que o material começa privado.
- Nas tentativas assistidas pelo agente, `fileChooser.setFiles` foi recusado com orientação para habilitar “Allow access to file URLs”. O agente não submeteu arquivo.
- Após a mensagem do usuário de que havia selecionado e enviado, a tela observada ainda mostrava “Sem materiais por enquanto”; após uma recarga, o mesmo estado persistiu, sem ID, link ou estado de processamento. Essa evidência contradiz a mensagem de envio, mas não determina o que ocorreu na outra interação/aba.

## Avaliação QA (apoio à coordenação)

- A avaliação privada estava **“Pronta para finalizar”**, revisão 3, com uma questão e gabarito marcado privado. A interface dizia que prova e gabarito seriam arquivos separados.
- Os botões de PDF de prova e de gabarito separado foram acionados uma vez cada. A interface exibiu **“Trabalhando no seu pedido — Exportação da avaliação”**. Não apareceu evento de download em 15 segundos para cada clique.
- Após a coordenação informar que o worker voltou, houve uma nova tentativa de prova PDF. O painel ainda dizia “Trabalhando no seu pedido” depois de 30 segundos e nenhum link/endpoint de artefato apareceu na UI. A operação não foi repetida novamente.
- A coordenação informou status operacional de quatro jobs `ASSESSMENT_EXPORT` como `SUCCEEDED`/outbox `DONE`, além de quatro `AI_CONNECTION_CHECK` como `SUCCEEDED`. Esse resultado veio da coordenação, não de um link ou confirmação de download no UI.
