# Contexto e método

## Escopo

Auditoria visual da experiência pública e da área autenticada de docente em `http://localhost:3000`, com API local na porta 3001, em 03/10/2026. O front-end e o back-end já estavam em execução. As ações de cadastro, configuração e uso do produto foram realizadas pela interface visível e coordenadas pelo agente principal; não foram usadas chamadas REST, scripts ocultos ou alterações de código para substituir interações da plataforma.

O usuário autorizou o uso de duas chaves de API em contas QA, a criação de cadastros e a exploração das telas. Também autorizou posteriormente uma alteração temporária de entitlement para viabilizar a auditoria, sem cobrança, e a permissão local de upload. Nenhuma chave completa, senha ou código de convite foi copiado para estes relatórios.

## Conta e objetos QA

- Perfil: docente (`TEACHER`), nome exibido “Docente QA 0310”, e-mail `docente-qa-20261003-solrelay@example.test`.
- A chave identificada na conversa como chave_A foi inserida manualmente na configuração de IA da conta docente, sob o rótulo “Docente QA”; a interface exibiu apenas uma máscara.
- Disciplina: “Biologia QA 20261003”, com quatro tópicos sobre fotossíntese e três objetivos editados. ID observado: `1711c131-9648-4972-89f0-7711c42f9a48`.
- Turma: “QA Fotossíntese”. ID observado: `3a083069-6ec8-493c-8b86-cfe149137dbb`. Foi criado convite com validade de 24 horas e máximo de dois usos; o código não é registrado aqui.
- O agente aluno aceitou o convite pela interface. A turma passou de zero para um estudante.
- Roteiro de estudo: quatro tópicos selecionados; após preencher códigos de competência `QA-BIO` numerados, foi salvo como rascunho. A publicação foi tentada, mas não confirmada por bloqueio do diálogo nativo.
- Avaliação manual: uma questão de múltipla escolha, inicialmente rascunho; posteriormente observada pelo agente aluno como READY, privada, revisão 3. ID observado na criação: `5da421fc-2462-43f6-98fb-f8810781bc7f`.
- Fixture preparado localmente: `testes/fixtures/fotossintese-qa.pdf`. O usuário relatou que o envio/criação foi confirmado; na sessão QA, a interface continuou sem material visível, então recebimento/processamento não foi confirmado de forma independente.

## Sessões e cooperação

A primeira aba Chrome iniciada no subagente compartilhou o perfil autenticado que já estava aberto. Para manter contas isoladas, o agente principal conduziu as ações docentes pela sua sessão IAB visível, enquanto o agente aluno usou sessão Chrome própria. O subagente docente inspecionou telas públicas em sua aba e consolidou os registros e a avaliação visual das evidências.

O docente fez logout e login novamente pela interface; logout voltou à landing deslogada e login retornou ao dashboard docente. O nome, e-mail somente leitura e papel `TEACHER` foram conferidos. Não houve aceite vinculante de termos durante o cadastro.

## Ambiente e limitações do método

- A linha de base não ficou imutável: outra atividade alterou arquivos do front-end durante a auditoria. Os achados refletem os comportamentos observados na sessão, não uma revisão de uma versão congelada.
- A extensão de automação não conseguiu fornecer arquivo local ao controle de upload: `setFiles` resultou em mensagem sobre habilitar acesso a file URLs e o input continuou sem arquivo. A página `chrome://extensions` foi bloqueada pela ferramenta.
- Diálogos nativos e timeouts do controle do navegador impediram confirmar algumas ações. O relatório diferencia tentativa de conclusão.
- A inspeção de acessibilidade foi básica, usando controles de teclado e árvore acessível onde disponíveis; não foi uma auditoria completa com leitor de tela.
- Não houve alteração de código nem execução de suíte, build ou lint nesta etapa de documentação.

## Plano e worker ao fim da auditoria

Após autorização do usuário, as contas QA docente e aluno receberam temporariamente entitlements de teste sem cobrança. Ao encerrar, o agente principal confirmou que apenas as duas subscriptions correspondentes aos e-mails QA foram restauradas para FREE; o registro está em [`../planos-qa-restaurados.json`](../planos-qa-restaurados.json).

Histórico de worker comunicado pelo agente principal: o processo filho antigo (`352278`) recebeu SIGTERM sem encerrar a API; um worker temporário (`468648`) processou quatro jobs de verificação de conexão IA e quatro jobs de exportação com estado SUCCEEDED e depois foi encerrado; o watcher deixou ativo o novo worker original (`471215`). O sucesso dos jobs não equivale, por si só, a confirmação visual da conexão com o provedor nem a download concluído no navegador.
