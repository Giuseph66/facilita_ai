# 02 — Cobertura e resultados

`PASSOU` descreve o percurso observado com resultado esperado; `FALHOU` indica divergência ou falha visível; `BLOQUEADO` indica dependência de conteúdo, entitlement, worker ou ferramenta; `NÃO TESTADO` indica que não houve ação suficiente para julgar.

| Tela/rota | Estado | Resultado factual |
|---|---|---|
| Landing pública (`/`) | PASSOU | Hero, recursos, “Como funciona”, planos, FAQ e CTAs visíveis. Hierarquia clara à primeira vista. |
| Cadastro (`/cadastro`) | PASSOU | Campos de nome/e-mail/senha, requisitos de senha e escolha Docente/Acadêmico visíveis; cadastro QA no papel de aluno concluído. Não apareceu aceite legal na etapa observada. |
| Login (`/entrar`) | PASSOU | Login QA funcionou; controles de mostrar senha, recuperar senha e criar conta visíveis. Logout e nova entrada também funcionaram. |
| Recuperar senha (`/recuperar-senha`) | PASSOU, sem envio | Campo de e-mail e ação “Enviar instruções” claros; o pedido não foi enviado para evitar disparo de e-mail. |
| Painel aluno (`/app`) | FALHOU | Após matrícula e reautenticação, o painel continuou em “Ainda sem turmas” e “Seu espaço está pronto”. |
| Disciplinas (`/app/disciplinas`) | FALHOU | A lista mostrou “Ainda sem disciplinas”, mesmo com turma QA matriculada. |
| Turmas (`/app/turmas`) | PASSOU | Convite aceito; a turma QA permaneceu listada após logout/login. |
| Detalhe da turma (`/app/turmas/{id}`) | PASSOU, vazio esperado | Nome e período exibidos. “Sem materiais visíveis nesta turma” e “Roteiro ainda não publicado”. Nenhum conteúdo ou gabarito privado apareceu. |
| Detalhe da disciplina (`/app/disciplinas/1711c131-9648-4972-89f0-7711c42f9a48`) | FALHOU quanto à navegação | A rota conhecida abriu “Biologia QA 20261003”, descrição e quatro tópicos; a lista do aluno continuou vazia. A disciplina não tinha material e os comandos de estudo ficaram desabilitados. |
| Conversas/tutor (`/app/conversas`) | FALHOU | “Abrir conversa” com título marcado opcional e contexto “Sem contexto de disciplina” mostrou aviso genérico; nenhuma conversa apareceu. Não houve reteste depois do entitlement temporário. |
| Meus estudos (`/app/estudo`) | BLOQUEADO no estado observado | Sem disciplina selecionável; “Criar material” desativado. O tipo oferecia resumo, cartões, plano, revisão e exercícios semelhantes. |
| Simulados (`/app/simulados`) | BLOQUEADO no estado observado | Sem disciplina selecionável; “Gerar simulado” desativado. Estado vazio explica dependência de disciplina/material. |
| Perfil (`/app/configuracoes/perfil`) | PASSOU | Nome, e-mail de conta QA em modo somente leitura, papel e espaços disponíveis exibidos. Não foram alterados dados. |
| Inteligência artificial (`/app/configuracoes/ia`) | BLOQUEADO/INCONCLUSIVO | Chave QA salva; consulta de uso respondeu “Mês: restam 100%”; a linha continuou “Não verificada” na observação. A coordenação depois informou jobs de verificação QA `SUCCEEDED`; não houve confirmação visual do aluno após essa mudança. |
| Plano/consumo (`/app/configuracoes/plano`) | PASSOU, estado inicial | No início, plano Livre e limites estavam explícitos; gerações de IA não incluídas e outros planos “Em breve”. A coordenação depois aplicou entitlement QA temporário e informou restauração para `FREE`. |
| Privacidade e dados (`/app/configuracoes/privacidade`) | FALHOU em feedback/responsividade | Exportação da própria conta QA concluída e download iniciado; simultaneamente apareceu aviso de falha de conexão e aviso de sucesso. A tela pós-exportação excedeu a largura mobile. Prévia de exclusão aberta e cancelada. |
| Avaliações do aluno | NÃO TESTADO | Não havia acesso a avaliações docentes na navegação do aluno. Prova e gabarito permaneceram privados no teste. |
| Conteúdo liberado, tutor com fontes, resumo/cartões/plano/exercícios e simulado respondido | BLOQUEADO/NÃO TESTADO | Sem material confirmado na turma; não foi possível julgar citação, fonte, correção, entrega ou resultado. |

## Responsividade — amostra

Viewport emulado inicialmente em 390 × 844 px. Painel, detalhe da turma, formulário de estudos e simulados mostraram cartões empilhados, controles legíveis e atalhos fixos no rodapé. A rolagem do detalhe da turma permitiu ver os cartões de estado vazio completos. O menu hambúrguer abriu as rotas principais e fechou normalmente.

Na tela Privacidade após criar uma exportação, a faixa “Configurações” é horizontalmente rolável, mas também há overflow do documento: `innerWidth=390`, `documentElement.scrollWidth=452`; a seção de solicitações recentes tinha `clientWidth=341`/`scrollWidth=435`, cartão interno `307/418`. A conclusão de overflow da página é separada do comportamento intencional de rolagem da faixa de abas.

## Público/planos/FAQ — tópicos vistos

- FAQ indicava que o plano Livre não exige cartão, que geração/conversa depende de conta de IA, que materiais começam privados e estudantes só veem itens liberados, que mudança de plano não apaga dados, e que há fluxo de exportação/exclusão.
- A comparação de planos listava limites e itens de geração/exportação. A informação de entitlement do plano Livre na conta era coerente com a tela de plano na fase inicial.
