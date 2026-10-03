# Tentativas e bloqueios

Este registro diferencia ações tentadas, concluídas e impedidas. Um job concluído no worker não significa que a UI apresentou resultado ou que houve download no navegador.

## IA e chave de conexão

- A chave da conta docente foi configurada manualmente pela tela como conexão “Docente QA”; a interface mostrou apenas uma máscara. `gpt-oss:20b` foi escolhido e o botão de salvar confirmou a seleção.
- A tela Plano indicava “Sua conta Ollama Cloud não conectada” e a configuração ficou inicialmente como não verificada. O agente principal observou quatro jobs `AI_CONNECTION_CHECK` das contas QA ainda `QUEUED`, sem erro ou conclusão; esse estado não prova que as chaves eram inválidas.
- Mais tarde, um worker temporário processou quatro jobs de verificação com estado SUCCEEDED. Isso não resultou em evidência de geração de IA na interface. Chaves e provedor não foram classificados como causa de falha.
- A geração assistida de avaliação permaneceu indisponível porque a disciplina não tinha arquivos prontos; botão “Gerar rascunho” estava desabilitado. A configuração de 10 questões, dificuldade intermediária e instruções opcionais foi observada, mas nenhuma avaliação por IA foi gerada.
- Depois do reload, o seletor de modelo mostrou outro modelo; esse comportamento está documentado em D-03. Não foi possível estabelecer qual preferência a geração consumiria.

## Upload, processamento e liberação de conteúdo

- O PDF sintético `testes/fixtures/fotossintese-qa.pdf` foi preparado para o fluxo didático.
- O controle visível de upload foi tentado com a ferramenta de automação. O método de seleção retornou exigência de “Allow access to file URLs” e o input permaneceu sem arquivo nessa tentativa automatizada, inclusive após reload e nova tentativa.
- O usuário informou que confirmou a criação/envio do material. Apesar disso, a UI da conta QA continuou sem material visível. A ferramenta bloqueou `chrome://extensions`; não foi possível inspecionar sua configuração. O usuário também disse não conseguir fazer a seleção manual.
- A divergência é: confirmação relatada pelo usuário versus ausência de material na interface QA. Não foi comprovado pela sessão QA se o arquivo foi submetido ao produto, processado ou associado à disciplina. O agente aluno viu “Sem materiais visíveis nesta turma”.
- Sem material pronto visível na QA, conversa, estudo, simulado, detalhe de material e geração assistida não puderam ser concluídos.

## Avaliação e exportações

- Avaliação manual criada e salva; uma questão de múltipla escolha. Depois, o agente aluno a encontrou READY, privada, revisão 3.
- O docente tentou marcar pronta, mas o diálogo nativo bloqueou o controle IAB; a conclusão READY só foi observada posteriormente pelo agente aluno. Não atribuir a confirmação READY ao primeiro clique bloqueado.
- PDF da prova e PDF do gabarito foram acionados uma vez cada. Ambos mostraram “Trabalhando no seu pedido / Exportação da avaliação”. Após 15 segundos não houve download.
- Antes do reteste adicional, o worker temporário processou quatro jobs de exportação como SUCCEEDED. Depois do reinício, o agente aluno fez um reteste adicional da prova pela UI; após 30 segundos, continuava “Trabalhando”, sem download. Não há resultado informado de um novo reteste do gabarito. O estado SUCCEEDED dos quatro jobs anteriores não comprova o resultado do reteste posterior.
- Exportação de privacidade é um fluxo distinto: foi concluída, exibiu link com validade até 10/10 e o JSON foi baixado. O problema nessa tela foi o feedback contraditório, registrado em D-02.

## Roteiro e confirmação nativa

- O primeiro salvamento do roteiro com quatro assuntos marcados e códigos vazios retornou “Confira campos destacados”. Depois de preencher quatro códigos `QA-BIO`, o rascunho foi salvo e a UI mostrou confirmação.
- A publicação ficou disponível. A ação foi tentada, mas a confirmação nativa ficou bloqueada pela ferramenta; publicação não confirmada. O estado a reportar é rascunho.

## Plano e worker

- No plano Livre inicial, a conta docente tinha limite de uma turma no total e zero gerações incluídas; os planos pagos apareciam “Em breve”, sem opção de troca na UI.
- Com autorização explícita do usuário, o agente principal aplicou entitlements temporários de teste às duas contas QA sem cobrança. Ao fim, confirmou a restauração de apenas essas duas contas para FREE; ver [`../planos-qa-restaurados.json`](../planos-qa-restaurados.json). A cópia da cota foi classificada como P3 em D-05; a recusa da segunda turma funcionou.
- Histórico comunicado: worker filho anterior `352278` recebeu SIGTERM, API permaneceu ativa; worker temporário `468648` processou quatro jobs de IA e quatro exports como SUCCEEDED, e foi encerrado; watcher do worker original deixou ativo `471215`. O estado final informado é subscriptions QA FREE e worker `471215` ativo.

## Ações não executadas

- Não foi solicitada exclusão permanente da conta. O preview foi cancelado; o acesso da conta permaneceu ativo.
- Não foi enviada solicitação de recuperação/reset de senha.
- Houve um reteste adicional da exportação da prova após o reinício do worker; não foi informado novo reteste do gabarito.
- Não houve geração IA, publicação de roteiro, processamento/liberação de conteúdo QA confirmado ou teste de compartilhamento de gabarito após publicação.
