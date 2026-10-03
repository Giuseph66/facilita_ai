# Estado final e intervenção autorizada

## Contas e objetos QA

- Docente: `docente-qa-20261003-solrelay@example.test`.
- Aluno: `aluno-qa-20261003-83c1@example.test`.
- Disciplina: Biologia QA 20261003, ID `1711c131-9648-4972-89f0-7711c42f9a48`.
- Turma: Turma QA Fotossíntese, ID `3a083069-6ec8-493c-8b86-cfe149137dbb`, período 2026/2; um aluno matriculado observado.
- Avaliação privada: Avaliação privada QA - Fotossíntese, ID `5da421fc-2462-43f6-98fb-f8810781bc7f`; READY, revisão 3 e uma questão, conforme última observação de conta docente.
- Roteiro: quatro tópicos e códigos QA-BIO-01 a QA-BIO-04 salvos como rascunho. Publicação foi tentada e ficou bloqueada na confirmação nativa; não foi comprovada.
- Material: usuário informou confirmação de criação após envio manual; não apareceu nas sessões QA observadas. Nenhum ID foi obtido. Situação pendente.

Credenciais e código de convite não são reproduzidos aqui. Contas e artefatos não foram apagados; o preview de exclusão foi cancelado.

## Planos temporários encerrados

Com aprovação explícita, somente o docente QA recebeu Teacher Pro e somente o aluno QA recebeu IA Própria/BYOK para reteste. Não houve cobrança nem contratação pela interface.

Ao encerrar a coleta, uma transação restaurou as duas subscriptions a FREE, conferindo ID da subscription e email da conta QA. Registro: [originais](../planos-qa-original.json) e [restauração](../planos-qa-restaurados.json). A restauração foi uma limpeza do ajuste temporário já autorizado; não um novo teste.

## Worker

O usuário autorizou reiniciar somente o worker local. O processo principal da API foi preservado (PID 393231 na verificação daquela sessão). Uma instância temporária do worker (PID 468648) processou os jobs acumulados. Consultas QA mostraram quatro `AI_CONNECTION_CHECK` e quatro `ASSESSMENT_EXPORT` em `SUCCEEDED`, outbox `DONE`, uma tentativa por evento.

O filho antigo do watcher do worker (PID 352278) foi encerrado; o watcher iniciou novo filho (PID 471215), observado ativo. A instância temporária foi encerrada após o processamento; o encerramento gracioso não terminou o processo, então foi concluído por sinal de término forçado. PIDs são registro histórico, não identificadores permanentes para futuras ações.

O worker foi recarregado sem mudança de conteúdo em `backend/src/worker.ts`; a primeira tentativa de notificar o watcher apenas atualizando o arquivo não demonstrou reinício. Não alteramos frontend, API, configuração ou schema para resolver a fila. A causa original não foi isolada, e não houve confirmação de processamento de novos jobs pelo filho final antes do encerramento solicitado.

## Encerramento da coleta

O aluno atingiu limite de uso; o docente também recebeu aviso de limite. O usuário pediu retomada exclusivamente para recuperar registros e organizar documentação. Os mesmos dois agentes foram reativados para esse trabalho, sem novos testes, novas gerações ou novas capturas.

As evidências visuais existentes são históricas. O viewport temporário do navegador interno foi restaurado antes dessa etapa documental. Diálogos nativos e abas de recuperação foram limitações da sessão; não há alegação de que todos os diálogos ou fluxos tenham concluído.
