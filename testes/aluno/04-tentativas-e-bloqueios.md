# 04 — Tentativas e bloqueios

## Sequência da jornada do aluno

1. **Entrada no Chrome:** havia sessão de outra conta. O menu da aplicação foi usado para sair; os dados anteriores não foram abertos nem examinados.
2. **Cadastro:** conta QA de papel Acadêmico criada pela UI; os controles de senha e papéis eram visíveis.
3. **Login/logout:** autenticação do aluno e nova entrada após convite funcionaram.
4. **IA própria:** conexão foi cadastrada manualmente com a chave QA destinada ao aluno. A chave não aparece neste arquivo. Consulta de uso respondeu “Mês: restam 100%”; campo/linha de estado continuou “Não verificada”. A coordenação informou depois que os jobs `AI_CONNECTION_CHECK` das contas QA terminaram `SUCCEEDED`; não se atribuiu o estado a chave inválida.
5. **Plano inicial:** a conta estava em Livre; interface informou que geração IA não estava incluída e que os planos pagos estavam “Em breve”.
6. **Convite/turma:** código de convite QA inserido manualmente pela UI; matrícula persistiu em Turmas após logout/login. O valor do código foi omitido.
7. **Dashboard/listas:** painel e lista de disciplinas ficaram vazios apesar da turma em Turmas. A rota conhecida da disciplina abriu por acesso direto, mas sem material.
8. **Tutor:** tentativa única de abrir conversa com título opcional e sem contexto terminou em validação genérica; nenhum registro apareceu.
9. **Estudo/simulados:** não foi possível prosseguir sem disciplina selecionável/material.
10. **Privacidade:** exportação da própria conta QA foi concluída; download confirmado, pacote não aberto. Prévia de exclusão cancelada sem enviar solicitação.
11. **Responsividade:** largura móvel 390 × 844; painel, turma, estudo e simulados inspecionados; overflow da página de privacidade medido e documentado.

## Apoio temporário à conta docente

Por orientação da coordenação, houve troca temporária para a conta QA docente no mesmo Chrome para testar upload e avaliação. Não foram inseridas credenciais no relatório.

- Formulário da disciplina mostrava nome do material, seleção PDF/PPTX, classificação Acadêmico (compartilhável por turma) e Secreto da docente (não compartilhável); aviso: todo material começa privado.
- A seleção via `fileChooser.setFiles` foi tentada após ler instruções de upload e falhou com a mensagem que pede “Allow access to file URLs”. Após uma recarga e seleção nova, o erro continuou. Depois de o usuário confirmar a permissão novamente, houve uma tentativa nova e o mesmo erro. Nenhum arquivo foi submetido pelo agente.
- A navegação para `chrome://extensions` para inspeção somente leitura foi bloqueada pela política do navegador. Não foi tentado contorno nem alteração de permissão.
- O usuário depois informou “selecionei e enviei”. Na tela docente QA observada pelo agente, ainda aparecia “Sem materiais por enquanto”; formulário vazio; nenhuma identificação, link ou estado de processamento. Após uma recarga única, o estado continuou vazio. A mensagem e a tela são divergentes; não se inventa resultado.
- A tela foi deixada visível na seção “Adicionar material” com título QA preparado e sem arquivo/submit antes da ação manual relatada. Depois da recarga e do relato de envio, a tela continuou vazia.

## Avaliação privada e exportações (apoio à coordenação)

- A coordenação informou que o usuário confirmou o diálogo de confirmação; o agente não repetiu a confirmação.
- A avaliação QA abriu como `READY`/“Pronta para finalizar”, revisão 3, privada, com uma questão sintética. O detalhe indicava gabarito privado. Não foi finalizada.
- Um clique em “Prova · PDF” e um clique em “Gabarito separado · PDF” abriram “Trabalhando no seu pedido — Exportação da avaliação”. Nenhum evento de download foi observado em 15 s para cada clique. Não foram repetidos naquele estágio.
- A coordenação depois informou que um worker processou quatro `AI_CONNECTION_CHECK` e quatro `ASSESSMENT_EXPORT` como `SUCCEEDED`, com outbox `DONE` e uma tentativa. Depois dessa atualização, por pedido da coordenação, foi feito um clique adicional em “Prova · PDF”; após 30 s a UI ainda dizia “Trabalhando no seu pedido”. Não apareceu link/endpoint/download no detalhe reaberto. O agente não fez novo clique no gabarito.
- Na lista de disciplina/avaliações, o item mostrava `READY` mas “— questões”; detalhe mostrava uma questão. É discrepância separada observada no apoio docente.

## Estado do entitlement

A coordenação aplicou temporariamente plano/entitlement QA (`TEACHER_PRO` para docente e `BYOK` para aluno) sem cobrança. Depois informou que restaurou apenas as duas assinaturas QA para `FREE`, com correspondência pelo e-mail normalizado, e registrou a ação em `testes/planos-qa-restaurados.json`. Não houve teste visual após restauração.

## Limites da coleta

- O usuário encerrou novas ações por limite. Não foram repetidas gerações, checagens de conexão, exports ou tentativas de arquivo após esse aviso.
- Não há confirmação de material processado/liberado, então perguntas com fontes, citações, resumo, cartões, plano, exercícios, simulado respondido/corrigido e resultado permanecem bloqueados/não testados.
- Não foi possível concluir pela UI se os quatro jobs `ASSESSMENT_EXPORT` relatados pela coordenação geraram downloads aproveitáveis.
