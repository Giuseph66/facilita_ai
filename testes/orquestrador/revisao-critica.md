# Revisão crítica do orquestrador

Auditoria de 03/10/2026. Este documento consolida observações dos dois agentes Luna, ações visuais conduzidas pelo coordenador e consultas de diagnóstico já realizadas. A coleta foi encerrada por instrução do usuário após o limite de uso. Não foram retomados testes para preencher lacunas.

## Como interpretar os resultados

- **Confirmado:** comportamento reproduzido ou resultado persistido observado na sessão QA.
- **Hipótese:** explicação ou melhoria plausível que ainda precisa de comprovação.
- **Bloqueado:** uma dependência ou ferramenta impediu o teste; não significa que o produto falhou.
- **Não testado:** não há resultado suficiente. Uma visita à tela não valida seu fluxo completo.

P1 indica bloqueio importante da jornada; P2, defeito funcional ou feedback que prejudica o uso; P3, melhoria de clareza ou acabamento. As prioridades abaixo são minha avaliação e podem divergir das sugestões originais dos agentes.

## Defeitos confirmados e diagnóstico

| ID | Prioridade | Resultado e impacto | Diagnóstico e limite |
|---|---|---|---|
| O-01 | P2 | Criar turma persiste a turma, mas mostra erro de conexão e sucesso ao mesmo tempo. Formulário/lista não atualizam até recarga; pode induzir repetição. | `front-end/components/courses-screen.tsx`, função de criação: usa `event.currentTarget.reset()` depois de `await`, antes de atualizar a lista. O alvo transitório do evento já não é válido. O erro apresentado não representa o resultado da criação. |
| O-02 | P2 | Exportar dados pessoais conclui e permite download, porém mostra “Pedido não enviado” e “Pedido registrado” juntos; senha permanece no campo. | `front-end/components/settings-screen.tsx` contém o mesmo uso de `event.currentTarget` depois de `await`. Captura docente e observação independente do aluno sustentam o comportamento. Não testamos a exclusão final; eventuais consequências nesse fluxo são apenas hipótese. |
| O-03 | P2 | Salvar o modelo de IA confirma sucesso, mas recarregar mostra outro modelo, conforme a ordem da lista. A tela pode induzir um novo salvamento incorreto. | `front-end/components/ai-settings.tsx` carrega conexões/modelos e inicializa com o primeiro modelo; não busca a preferência salva ao montar. Não foi demonstrado que a preferência no backend se perdeu nem qual modelo seria usado numa geração. |
| O-04 | P2 | Roteiro com tópicos selecionados e códigos de competência vazios falha com mensagem genérica; preencher os códigos permite salvar. | `classes-screen.tsx` envia `competencyCode: null` para campo vazio; `blueprintInputSchema` aceita string com padrão vazio, não `null`. É incompatibilidade de contrato. Não concluir que códigos precisam ser obrigatórios: aceitar vazio é compatível com o esquema observado. |
| O-05 | P2 | Aluno matriculado vê a turma em Turmas, mas o dashboard diz “Ainda sem turmas” e a lista de disciplinas fica vazia. O detalhe da disciplina abre pela URL conhecida. | Há forte evidência de falha de descoberta/listagem. O frontend escolhe um workspace pessoal e consulta disciplinas por workspace; não havia seletor de espaço visível na navegação observada. A causa completa do dashboard não foi comprovada. |
| O-06 | P2 | Privacidade com exportação recente excede a viewport de 390 px: documento com 452 px; seção de solicitações recentes também transborda. | Métricas DOM coletadas pelo aluno distinguem o overflow real da faixa de configurações intencionalmente rolável. A regra CSS responsável não foi identificada. Não há screenshot do aluno persistido. |
| O-07 | P2 | Abrir conversa com título preenchido e contexto opcional vazio retorna validação genérica e não cria conversa. | A observação do aluno é confirmada para essa combinação. O frontend envia `title`; o esquema estrito `conversationInputSchema` observado não declara esse campo. É uma explicação de contrato forte, mas não houve inspeção da resposta HTTP nem reteste sem título para comprovar a causa isoladamente. |

## Melhorias e alegações reclassificadas

| Assunto | Avaliação crítica |
|---|---|
| Limite de turmas “no total” versus “até reiniciar” | P3 de texto. A segunda turma foi bloqueada corretamente; alinhar mensagem com a natureza do limite. Não é falha de autorização. |
| Mover a única questão para baixo | P3: ação aparentemente sem destino útil. Desabilitar movimentos impossíveis. |
| Alternativa A correta por padrão | Risco de UX, P3; a seleção estava visível. Não é prova de gabarito errado nem de perda de dados. |
| Validação “campos destacados” | Melhorar associação de erro ao campo. A ausência de destaque na árvore acessível, sozinha, não comprova ausência de destaque visual. |
| “1 estudantes” / “1 matrículas” | P3 de pluralização; observado com um aluno. |
| Rótulo mobile “Tutor” | Sugestão de clareza; preferência editorial, sem falha funcional demonstrada. |
| Rota de confirmação de exclusão aberta diretamente | P3: afirma pedido aceito e sessão encerrada fora do fluxo. A navegação não iniciou exclusão; não classificar como apagamento ou vulnerabilidade. |
| Autofill de email/chave/senha no Chrome | Informativo. Nenhum valor anterior foi usado nem há evidência de vazamento pelo backend. Campos devem ajudar o navegador a distinguir nome, segredo e confirmação textual. |
| Cabeçalhos com revisão/quantidade ausente | Registro visual de apresentação incompleta, a confirmar: revisão aparece corretamente no corpo e a avaliação salva contém uma questão. Não inferir perda da questão. |

## Bloqueios e divergências que não viram bugs automaticamente

1. **Worker/fila:** quatro verificações de IA ficaram `QUEUED`, com outbox `PENDING` e zero tentativas. Após intervenção autorizada, consultas restritas às contas QA mostraram quatro verificações e quatro exportações `SUCCEEDED`, com outbox `DONE` e uma tentativa. O bloqueio inicial é do ambiente em execução; não demonstra chave inválida ou rejeição do provedor. A causa original não foi isolada.
2. **PDF da avaliação:** pedidos iniciaram “Trabalhando no seu pedido”. Houve sucesso dos jobs antigos no banco; o reteste visual do aluno ainda ficou trabalhando por 30 segundos sem download. Esse último pedido não teve seu estado final correlacionado ao banco antes do encerramento. Não declarar defeito definitivo da exportação nem download validado.
3. **Upload:** a ferramenta Chrome negou seleção por permissão de URLs de arquivos, mesmo após confirmações humanas. No IAB, seleção automática retornou sem arquivo no input. Essas tentativas não chegaram ao upload do backend. Depois, o usuário informou envio manual com confirmação de material criado, enquanto as sessões QA observadas continuaram sem materiais. Preservamos os dois relatos; conta/aba, persistência e destino precisam ser conferidos no reteste.
4. **Confirmações nativas:** diálogos de JavaScript bloquearam o controle automático. A avaliação foi posteriormente confirmada como READY, privada, revisão 3. A publicação do roteiro foi apenas tentada: não há confirmação final de publicação. Timeouts do controle não são, por si, falhas do aplicativo.
5. **Plano Livre:** o bloqueio de geração é compatível com as regras exibidas. Entitlements temporários foram autorizados exclusivamente para as contas QA e restaurados ao fim. A indisponibilidade da troca de plano era explicitamente informada como piloto.
6. **Limite de uso dos agentes:** encerrou a coleta antes de completar as jornadas dinâmicas. Os registros posteriores são organização documental de dados anteriores.

## O que funcionou com evidência suficiente

Cadastro e login dos dois papéis; logout/login QA; cadastro/edição de disciplina e seus tópicos/objetivos; persistência da turma; criação de convite e matrícula do aluno, inclusive após novo login; avaliação manual com questão salva; avaliação READY privada observada; salvamento do roteiro com códigos preenchidos; exportação/download dos dados pessoais; inspeção e cancelamento da exclusão; carregamento de modelos e consulta de consumo da chave; expansão dos cinco FAQs e comparação de planos; navegação mobile com Escape e retorno de foco no menu docente.

A ausência de material privado na visão inicial do aluno é um resultado positivo limitado àquele estado. Não validamos toda a matriz de permissões, revogação, links diretos de arquivos ou vazamento de gabaritos.

## Recomendação

Corrigir primeiro os contratos e o feedback de operações bem-sucedidas, depois a descoberta de disciplinas pelo aluno. Repetir o percurso com worker comprovadamente processando, material QA persistido e liberado, e plano de QA adequado. Só então julgar qualidade de respostas, fontes, conteúdos de estudo e simulados. Não houve correção do código da aplicação nesta auditoria.

Fontes documentais: [aluno](../aluno/README.md), [docente](../docente/README.md), [cobertura e limites](cobertura-e-limites.md), [estado final](estado-final.md).
