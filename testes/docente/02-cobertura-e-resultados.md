# Cobertura e resultados

O inventário contém as 25 rotas identificadas no aplicativo, além da inspeção da landing, FAQ e comparação de planos. “Visitada” registra que a tela abriu; não significa que todos os controles ou estados foram cobertos.

## Inventário de rotas

| Rota | Status | Resultado observado |
|---|---|---|
| `/` | PASSOU parcialmente | Landing com chamada principal, navegação de recursos, funcionamento, planos, perguntas e CTA final. A comparação de planos abriu como tabela legível no desktop. |
| `/cadastro` | PASSOU | Formulário com nome, e-mail, senha e papel; regras de senha visíveis. Conta QA docente criada. |
| `/entrar` | PASSOU | Logout levou à landing deslogada; login docente retornou ao dashboard, com estado intermediário “Aguarde…”. |
| `/recuperar-senha` | VISITADA | Campo de e-mail e botão “Enviar instruções”; não submetido. |
| `/auth/password-reset` | VISITADA, sem token | Sem token, mostrou formulário de solicitação de recuperação; nenhuma senha alterada. |
| `/pedido-de-exclusao-recebido` | VISITADA diretamente | Página estática exibiu confirmação de pedido e sessão encerrada, mas nenhum pedido foi enviado; a conta QA permaneceu ativa. |
| `/app` | PASSOU parcialmente | Atalhos para nova disciplina, turmas e avaliação; navegação docente e estados vazios vistos. |
| `/app/disciplinas` | PASSOU parcialmente | Disciplina criada; listagem completa e todos os controles não percorridos. |
| `/app/disciplinas/[id]` | PASSOU parcialmente | Tópicos e objetivos editados; upload de material não concluído. |
| `/app/turmas` | FALHOU parcialmente | Turma criada no servidor, mas erro e sucesso simultâneos; após reload, turma persistiu. Limite de uma turma impediu a segunda criação como esperado. |
| `/app/turmas/[id]` | PASSOU parcialmente | Convite criado, matrícula do aluno confirmada e roteiro salvo como rascunho. Publicação e conteúdo não confirmados. |
| `/app/materiais/[id]` | BLOQUEADO | Não havia material recebido/processado para abrir a rota. |
| `/app/conversas` | VISITADA | O agente principal abriu a tela antes de encerrar a sessão; nenhuma conversa foi criada. |
| `/app/conversas/[id]` | BLOQUEADO | Nenhuma conversa criada. |
| `/app/estudo` | NÃO TESTADO | Recurso listado no menu, jornada não percorrida. |
| `/app/estudo/[id]` | BLOQUEADO | Nenhum estudo criado ou material processado. |
| `/app/simulados` | NÃO TESTADO | Menu listado, jornada não percorrida. |
| `/app/simulados/[id]` | NÃO TESTADO | Nenhum simulado criado para abrir detalhe. |
| `/app/avaliacoes` | PASSOU parcialmente | Avaliação manual criada; geração assistida examinada, sem gerar conteúdo. |
| `/app/avaliacoes/[id]` | PASSOU parcialmente | Uma avaliação privada chegou a READY/revisão 3; revisão e exportação não foram integralmente validadas. |
| `/app/exports/[id]` | BLOQUEADO/PENDENTE | Prova e gabarito ficaram em “Trabalhando no seu pedido”; mesmo após reinício dos workers e espera de 30 s, não houve download observado pelo agente aluno. |
| `/app/configuracoes/perfil` | VISITADA | Nome e papel conferidos; salvar sem alteração não produziu feedback verificável. |
| `/app/configuracoes/ia` | PASSOU parcialmente | Chave inserida e salva com máscara; modelo escolhido e confirmação mostrada. Reload exibiu outro modelo selecionado. |
| `/app/configuracoes/plano` | PASSOU parcialmente | Plano Livre, cotas e piloto vistos; troca não disponível na UI. Entitlements temporários de QA foram depois revertidos. |
| `/app/configuracoes/privacidade` | PASSOU parcialmente | Exportação de dados concluída; prévia de exclusão aberta e cancelada. Exclusão final não submetida. |

## Outras áreas e ações

| Área/ação | Status | Observação |
|---|---|---|
| FAQ pública | PASSOU | Cinco acordeões abriram. Abordam plano gratuito sem cartão, dependência de Ollama Cloud para IA, privacidade/liberação pelo docente, downgrade com dados preservados e exportação/exclusão em Privacidade. |
| Comparação dos planos | PASSOU parcialmente | Quatro níveis e tabela de limites/benefícios carregaram; comparava arquivos, armazenamento, envios mensais, turmas, conversas, gerações, avaliações e exportações. Planos pagos indicavam “Em breve”. Na primeira leitura havia “Carregando planos…”; os cards apareceram carregados depois na sessão Chrome. |
| Perfil e autenticação | PASSOU | Cadastro, logout/login e papel docente confirmados pela UI. |
| Disciplina, tópicos e objetivos | PASSOU | Disciplina criada; quatro tópicos e três objetivos salvos. |
| Convite e matrícula | PASSOU | Convite criado e aceito pelo aluno; turma mostrou um estudante. O código não foi preservado no relatório. |
| Privacidade da turma | PASSOU | Antes de liberar conteúdo, aluno viu “Sem materiais visíveis nesta turma” e “Roteiro ainda não publicado”; não viu conteúdo privado nem gabarito. |
| Upload e processamento | BLOQUEADO / divergência | O usuário relatou que a criação/envio foi confirmado; na sessão QA, a interface continuou sem material visível e não houve confirmação de processamento. |
| Avaliação manual | PASSOU parcialmente | Questão salva; depois observada READY e privada, revisão 3. Botões de exportação acionados uma vez cada sem download observado. |
| Geração assistida | BLOQUEADO por pré-requisito | Tela indicou ausência de arquivos prontos na disciplina e deixou “Gerar rascunho” desabilitado; configuração permitia 10 questões, dificuldade intermediária e instruções opcionais. |
| Simulados e estudo do aluno | NÃO TESTADO/BLOQUEADO | Sem conteúdo processado, simulados e sessões de estudo não foram criados. |
| Roteiro da turma | PASSOU parcialmente | Quatro tópicos e quatro códigos `QA-BIO` permitiram salvar rascunho. Publicação foi tentada, mas o diálogo nativo não pôde ser confirmado. |
| Exportação de privacidade | PASSOU com feedback contraditório | Pedido registrado e arquivo JSON baixado; a interface mostrou também um erro e manteve a senha no campo. |
| Exclusão de conta | NÃO TESTADA além da prévia | Confirmação solicitava digitar `EXCLUIR` e senha; ação foi cancelada. Nenhum apagamento permanente ocorreu. |
| Mobile 390×844 | PASSOU parcialmente | IA sem overflow horizontal. Menu abriu, Escape fechou e devolveu foco ao controle; link Turmas navegou. Outras telas mobile não cobertas. |

## Estado final conhecido dos dados QA

O professor e o aluno foram vinculados à turma. A disciplina e a turma persistiram; havia um estudante matriculado. O roteiro permaneceu rascunho. A avaliação ficou privada e READY segundo a verificação cruzada. O usuário relatou confirmação de envio do material, mas a sessão QA permaneceu sem material visível; não se confirmou processamento, publicação de roteiro, liberação de conteúdo ou exportação da prova/gabarito. Ambos os planos QA foram restaurados para FREE, conforme o registro de restauração.
