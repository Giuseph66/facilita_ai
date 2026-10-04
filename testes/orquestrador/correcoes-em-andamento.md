# Correções e auditoria de conclusão

Objetivo: corrigir os problemas válidos de `testes/**` e `claude_reclama.md`, converter criação/edição inline e alertas nativos em modais. Reclamações sobre documentação antiga estão excluídas. Este registro acompanha trabalho atual; não substitui as evidências históricas.

## Responsáveis

- `backend_corrections`: backend, worker, configuração, origem, contratos, descoberta por matrícula, identidade das chaves e limites. Luna xhigh.
- `frontend_modals`: primitive acessível, disciplinas/turmas/roteiros/avaliações/perfil/privacidade. Luna xhigh.
- `frontend_journeys`: início/onboarding, IA/modelo, materiais, conversas, estudos/simulados e jobs. Luna xhigh.
- Coordenador: CSS, navegação/copy pública, página de exclusão, regressões/E2E e auditoria integrada.
- `frontend_audit`: revisão independente, descoberta/paginação do aluno, rótulos e foco de modais. Luna xhigh.
- `journey_e2e`: jornada completa em navegador, dados sintéticos em banco isolado. Luna xhigh.

## Requisitos e evidências atuais

| Requisito | Evidência necessária | Estado atual |
|---|---|---|
| O-01/D-01 turma criada sem falso erro; O-02/D-02/A-05 exportação coerente | UI e regressão após resposta assíncrona; lista atualizada e senha limpa | Corrigido; regressões UI desktop/mobile passaram, com persistência, download e senha limpa |
| O-03/D-03 preferência de modelo reaparece | Salvar, recarregar, comparar modelo; GET da preferência | Corrigido; segundo modelo sintético salvo/recarregado; preferência real docente conferida por Computer Use |
| O-04/D-04 competência vazia permitida | Salvar/publicar roteiro vazio + leitura aluno | Corrigido; roteiro sem código salvo/publicado e lido pelo aluno no E2E desktop |
| O-05/A-03/A-04 matrícula aparece no início/lista | Aluno matriculado, listagem e detalhe coerentes com ACL | Corrigido; dashboard/lista/detalhe após matrícula e reload passaram no E2E desktop; integração ACL passou |
| O-06/A-06 privacidade cabe no celular com pedido recente | Documento <= viewport após exportação; abas rolam internamente | Corrigido; exportação recente em390px sem overflow nas regressões UI |
| O-07/A-02 conversa sem contexto/título válido | Primeiro envio cria conversa; título automático/contrato | Corrigido; primeira mensagem real criou conversa/título; duas respostas reais conferidas por Computer Use |
| D-05 quotas totais não dizem reiniciar | Copy local e central; bloqueio correto | Copy corrigida; integrações confirmaram limite total e cota diária separadamente |
| D-06 ações de movimento impossíveis e gabarito consciente | UI desabilita limites; questão sem resposta involuntária | Movimentos sem destino desabilitados; gabarito exige escolha explícita e erro devolve foco; E2E desktop passou |
| D-07 singular e contagem; enums sem exposição | UI contagens/revisões e labels humanas | Contagens de turma/matrícula/avaliação e labels humanos corrigidos; validação de fonte e UI |
| D-08 Tutor e D-09 visita direta exclusão | Navegação clara; rota não afirma execução sem ação | Corrigido; navegação mobile e página de exclusão conferidas por Computer Use |
| Claude 1.1 worker processa e informa atraso | Worker novo/desenvolvimento, heartbeat, health e job >1min | Corrigido; worker ativo, fila zerada, gerações reais concluídas e aviso de atraso simulado comprovado |
| Claude 1.2 configuração; 1.4 origens locais | Startup inválido falha sem segredo; ambas origens funcionam; prod restrita | Corrigido; unidades de configuração/origem e integração access passaram |
| Claude 1.3 envelope jobs e 1.5 chave inválida | Contratos reais e integração; nunca false verified | Corrigido; envelope e createdAt validados na UI/API; chave inválida nunca aprovada nos testes |
| Claude 2.1 Livre coerente | 5 gerações/dia com BYOK atual; migração preserva customizações | Migração aplicada; cinco gerações sintéticas concluíram e sexta foi bloqueada; BYOK preservado |
| Claude 2.2 onboarding e 2.4 ações contextuais | Passos refletem recursos reais; gerar do material/disciplina | Corrigido; onboarding requer chave verificada e modelo salvo; ações contextuais de pergunta/resumo passaram |
| Claude 2.5 modelos verificados; 2.6 rotação de chaves | Modelos de conexões verificadas; troca na ordem escolhida, inclusive entre contas Ollama diferentes | Regra revisada pelo usuário em04/10/2026: restrição por identidade removida; modelos continuam exigindo conexão verificada |
| Claude 3.1/3.2/3.3 copy/legibilidade | Sem códigos crus; vazios acionáveis; texto >=12px; mobile cabe | Labels/vazios corrigidos; fontes explícitas >=12px; Computer Use e regressões sem overflow |
| Formulários expansíveis de criação/edição em modais, sem alerts nativos | Inventário fonte e jornadas UI; foco, Escape, scroll, busy | Modais implementados; foco/Escape/camadas/bloqueio do fundo e drawer passaram em desktop/mobile |
| Claude 4.2 jornadas faltantes | E2E cadastro→IA→upload→pergunta→resumo→avaliação→export; ACLs materiais/gabaritos | Comprovado em desktop/mobile; rodada conjunta14/14 passou:12 jornadas UI +2 execuções do contrato HTTP |
| Upload/publish/export/renderização QA antes inconclusivos | Fixture PDF/PPTX pronta, ACL aluno/docente, job terminal e download real | PDFs processados, roteiro publicado e prova/gabarito baixados com cabeçalho %PDF- no E2E desktop/mobile; PPTX/ACL em integração anterior |
| Remover falso verified da conta sintética Ana Teste | Inspeção restrita email home-teste e estado falsificado, preservar usuários reais | Concluído pelo agente; somente duas conexões falsas da conta sintética foram limpas |
| Chave real e cofre | Uso real só com autorização/key disponível; rotação só se chave usada além do local | Docente: duas gerações via UI, used2/reserved0; aluno: geração pelo serviço real, used1/reserved0. Uso externo do cofre aguarda resposta |

## Limites e decisões

- Tagline lateral e papel exclusivo Docente OU Acadêmico são preferências expressas do usuário e permanecem.
- Timeout da ferramenta de upload/confirmação não é prova de bug; as jornadas completas foram retestadas na rodada conjunta final.
- Remoção de Tailwind e reestruturação integral do CSS são sugestões arquiteturais, não defeitos funcionais demonstrados; não serão introduzidas mudanças de dependência sem necessidade.
- O ajuste de largura anterior em globals.css/landing.css permanece e deve ser preservado.
- API local `/health/ready` respondeu ready na inspeção inicial. PIDs isolados não foram usados como prova: processamento, fila e gerações reais foram validados nas etapas seguintes.
- A rodada conjunta de navegador passou14/14 antes da revisão da regra BYOK em04/10/2026. A exigência de duas chaves da mesma conta foi removida por instrução do usuário; a condição externa do cofre ainda aguarda informação.

## Provas executadas nesta rodada

- `npm run typecheck` no frontend: passou antes das conversões dos agentes; é referência inicial, não gate final.
- `npm run test:e2e -- qa-regressions.spec.ts --reporter=line`: **2/2 passaram**, desktop + mobile, em 42,3 s. Runtime isolado e dados sintéticos. Cobriu cadastro docente, criação/edição/persistência de disciplina, turma com feedback/lista imediatos, cancelamento e confirmação de arquivamento com modais sobrepostos, fechamento das camadas, desbloqueio da aplicação, reabertura por clique e ausência de diálogos nativos/overflow. Não prova outras jornadas.
- Artefatos: `testes/orquestrador/evidencias/correcoes-modais-desktop.png` e `correcoes-modais-mobile.png`.
- Arquivo gerado `next-env.d.ts` deve continuar apontando `.next/dev/types/routes.d.ts`, preservado após a execução E2E.
- Frontend após conversões/auditoria: `npm run typecheck` passou; `npm run lint` passou com zero erros e um warning pré-existente em `postcss.config.mjs`.
- Backend: agente confirmou 16 testes de integração `access` + `intelligence-journey` (~54 s), 17 unidades focadas (incluindo indisponibilidade versus rejeição de chave), typecheck e crash-recovery isolado (1 teste, 110 s). Os gates após os ajustes de reconexão/supervisão constam abaixo.
- Migrações locais 0007/0008 aplicadas pelo agente; duas conexões falsas da conta sintética Ana Teste tiveram apenas status/identidade/snapshots limpos, preservando conta, objetos e conteúdo criptografado. Processamento e cotas foram verificados nas validações posteriores.
- Computer Use: seis telas principais no desktop ocupam toda a área restante ao lado do drawer, descontando 24 px de margem por lado; Simulados em390 px ocupa toda largura com16 px por lado, sem overflow. Evidência: `evidencias/largura-total-desktop.png`.
- Fonte mobile remanescente `.tag` foi elevada de8 para12 px; nenhum tamanho explícito de `font-size` entre1 e11 px restou no CSS das telas/componentes examinados.
- Computer Use mobile390×844: modal Criar disciplina mediu374 px dentro do viewport, não expandiu o documento, bloqueou scroll/interaction do fundo e ao fechar devolveu foco a Nova disciplina. Clique no nome da conta abriu Meu perfil/Sair acima do acionador (menu y658–754, botão y771–824), sem overflow. Capturas: `evidencias/modal-criacao-mobile-cua.png`, `evidencias/drawer-conta-mobile-cua.png`. Nenhum dado foi criado nessa inspeção.
- Auditoria adicional corrigiu o dashboard do aluno: `/classes` já reconhecia matrícula, mas o frontend ainda filtrava pelo espaço pessoal. Agora apenas docentes recebem o filtro por workspace; o teste UI de matrícula deverá provar também `/app`.
- Modal aninhado passou a restaurar o foco ao gatilho do diálogo filho; assertion adicionada à regressão de arquivamento/cancelamento, confirmado na rodada conjunta desktop/mobile.

## Correções adicionais encontradas nas jornadas completas

- Upload em `courses-screen.tsx` enviava `courseId` no body de um schema estrito que recebe a disciplina pela URL: POST400 comprovado no trace, campo extra removido; upload/processamento/detalhe passaram. Evidência original preservada em `/tmp/facilita-e2e-upload-400-20261003`.
- Conversa recebia `sources` da API, mas lia apenas `citations`: a resposta tinha quatro fontes e a UI não mostrava nenhuma. Contrato frontend alinhado; nome, página e link do PDF conferidos no E2E desktop.
- Conversa/material/avaliação atualizavam a página ao concluir sem preservar o job terminal no pai. Remontar o indicador reutilizava QUEUED. Callbacks agora salvam o estado terminal; segunda resposta real concluiu sem recarga e exibiu consumo.
- Entrega de simulado usava PUT num endpoint POST: 404 observado no trace. Método corrigido. A API exige todas as respostas; a tela agora explica isso e leva foco à primeira pendente. Copy descreve pontuação/comentários por tópico, que são o resultado disponível.
- Gabarito de múltipla escolha não é mais escolhido automaticamente ao criar, trocar tipo ou remover a opção marcada. Validação e foco foram conferidos na UI desktop.
- Configuração de IA não exibe como selecionado um modelo que ainda não foi salvo; primeiros passos também verificam a preferência persistida.
- O modal passou a manter o cabeçalho fora do conteúdo rolável e limitar a coluna do backdrop à largura disponível. Seletores de turma e etiquetas de liberação com nomes longos não podem alargar a página no mobile; nomes de arquivos também quebram linha. A etiqueta com nome de turma + Revogar chegou a425px e expandiu o layout mobile para506px, deslocando os cliques no modal; ações do cabeçalho do editor de questões também quebram linha e inputs podem encolher; grids de página/formulário usam trilhas com mínimo zero. A regressão verifica a largura física configurada (390px), evitando um falso positivo quando o navegador móvel amplia a área de layout. Evidência de Computer Use: `evidencias/modal-avaliacao-mobile-cua.png` (374px dentro de390px; documento390px).

- Uma rodada conjunta posterior passou11/12 (todo mobile6/6); o desktop recebeu500 de texto do proxy após ECONNRESET, sem queda da API. `api.ts` agora repete uma única vez consultas GET nesse caso específico; erros JSON e escritas não são repetidos. Regressão do cliente HTTP controla uma chamada por vez e exige duas tentativas no500 transitório/persistente, uma tentativa em POST e uma em erro JSON. A contagem foi retirada do teste UI porque o modo de desenvolvimento monta efeitos mais de uma vez. Trace original preservado em `/tmp/facilita-e2e-proxy-read-reset-20261004`.

## Validações finais já concluídas

- Backend: `npm run typecheck` e `npm run lint`, zero erros; `npm test`:40/40 em9 arquivos; `npm run test:supervisor`:3/3.
- `access.test.ts`:15/15 no reteste serial. Uma rodada concorrente excedeu o orçamento de15s de um job sintético RUNNING; o reteste completo serial passou, sem alteração na regra de cotas.
- O agente confirmou anteriormente a suíte backend de8 arquivos/35 testes e crash-recovery isolado. Essa evidência antecede os últimos ajustes de fixture/modelo; não é apresentada como uma nova execução conjunta.
- Frontend: checagem de tipos e lint passaram; permanece apenas o warning anterior de export anônimo em `postcss.config.mjs`. As últimas alterações também passaram em lint focado.
- Computer Use: resposta real docente concluída, repetição sem recarga, nota de consumo e largura sem overflow. Captura: `evidencias/ia-resposta-real-concluida-cua.png`.
- Duas respostas reais do docente: cota usada2, reservada0. Serviço real do aluno com modelo disponível explícito: cota usada1, reservada0. Nenhuma chave real de API ou chave do cofre foi escrita nos novos arquivos de diagnóstico.
- A rotação real entre várias chaves não foi forçada: cada conta QA possui uma chave, as identidades das duas contas são diferentes. A restrição automática foi provada por unidades com identidades iguais/diferentes/ausentes.
- O harness passou a reutilizar autenticação em memória entre regressões, respeitando o limite real de8 cadastros/h. Sem desativar limitador nem escrever cookies em relatórios.
- Locators ambíguos e sobrepostos do teste foram corrigidos; atraso de fila é mantido na simulação até o aviso aparecer e então o processamento real é observado. Falhas de locator não são classificadas como defeitos do produto.

- Jornada completa mobile isolada passou (1/1, 3,5min), incluindo avaliação manual/gerada, PDFs de prova e gabarito, simulado respondido e entregue. Rodada conjunta final passou após as correções de largura.

- Rodada conjunta final: `npm run test:e2e -- --reporter=line`, **14/14 passaram em3,2min**. São12 jornadas de navegador (6 desktop +6 mobile) e2 execuções do contrato do cliente HTTP. Inclui cadastro/login/perfil fixo, modelo persistido, dois PDFs processados, publicação/matrícula/ACL aluno, perguntas/resumos com fontes, avaliação manual/gerada, PDFs de prova/gabarito, simulado entregue, modais/foco/scroll e exportação pessoal. Usa IA sintética em runtime isolado; a prova real de IA é a de Computer Use/serviço descrita acima.
- `next-env.d.ts` foi restaurado para `.next/dev/types/` após o E2E; `npm run typecheck` passou depois da restauração, lint focado passou e `git diff --check` ficou limpo.
- Evidências atuais: `evidencias/largura-total-desktop.png`, `evidencias/modal-avaliacao-mobile-cua.png`, `evidencias/avaliacao-mobile-largura-cua.png`. Viewport temporário do Computer Use restaurado.

## Auditoria final do objetivo

- Os achados O-01 a O-07, D-01 a D-09, A-02 a A-08 e os itens funcionais do Claude foram confrontados novamente com os relatórios originais e as evidências atuais. A-01/autofill é informativo; os campos de chave e confirmação já usam autocomplete apropriado. Tagline foi mantida por preferência expressa; sugestões de troca de Tailwind/reestruturação de CSS e documentação antiga estão fora das correções de defeitos.
- Inventário atual de `app`, `components` e `lib`: zero chamadas a alert/confirm/prompt nativos; zero declarações de fonte inferiores a12px, incluindo shorthand e rem. Criação/edição que expandia a página utiliza modais. Formulários principais de autenticação, perfil, exportação pessoal, preferência de modelo, mensagem e respostas de simulado são permanentes; o seletor de liberação de material leva à confirmação em modal.
- `/health` local respondeu ready: um worker ativo, heartbeat de3s e nenhuma tarefa na fila. Os processos main/worker começaram após as alterações backend relevantes inspecionadas.
- A auditoria encontrou um detalhe adicional de D-07: a eyebrow era o texto fixo “AVALIAÇÃO · REVISÃO v”, sem número. Agora usa a revisão recebida da API. Computer Use confirmou “AVALIAÇÃO · REVISÃO 3” e o corpo com revisão3; captura `evidencias/avaliacao-revisao-correta-cua.png`. Lint focado e typecheck passaram após esse microajuste. A suíte conjunta14/14 antecede somente esse ajuste de texto, verificado separadamente no navegador.
- A inspeção anterior encontrou uma conexão CONNECTED em cada conta QA, com identidades Ollama diferentes. A exigência de identidade coincidente foi substituída pela nova regra expressa do usuário em04/10/2026.

## Pendências externas

### Material com leitura aparentemente travada —04/10/2026

- Caso real informado pelo usuário: documento `62729980-7a71-4e33-a548-810d1c598add`, PDF de4,2MB. O banco registrou READY cerca de9s após o envio; o job terminou SUCCEEDED em12s, com outbox DONE e sem erro. Computer Use no Chrome do usuário confirmou a tela ainda em “Processando · Lendo o arquivo”. A tela de detalhe fazia apenas uma consulta inicial, sem acompanhar o processamento.
- `DocumentScreen` agora consulta o status a cada3s enquanto QUEUED/PROCESSING, mantém a tela visível, tenta novamente após falhas temporárias e encerra consultas ao receber um estado final ou sair da tela.
- A conferência também encontrou a prévia PDF bloqueada pelo Chrome: resposta attachment e X-Frame-Options DENY. PDFs agora usam inline, SAMEORIGIN e frame-ancestors self; a exceção no Next limita-se à rota do conteúdo do documento. PPTX mantém attachment; demais páginas mantêm DENY e a autorização dos documentos permanece.
- Regressão reproduziu o status parado antes da correção. Após o ajuste,4/4 casos de navegador passaram (READY/FAILED, desktop/mobile, recuperação de503 e interrupção das consultas após estado final). Integração focada do conteúdo passou1/1, validando PDF, cabeçalhos, autorização e PPTX. Typecheck e lint focado passaram nos dois projetos; diff check limpo.
- Computer Use confirmou o documento real pronto, a prévia exibindo o PDF de39 páginas e o download iniciado por “Baixar original”. Evidência: `evidencias/material-pronto-preview-cua.png`. Não houve reprocessamento nem alteração do arquivo original.

### Cofre

Verificação real das duas chaves fornecidas em04/10/2026: ambas CONNECTED, com consulta de consumo válida (janela mensal;100% restante arredondado). As identidades retornadas por `/api/me` são diferentes; isso é permitido pela regra revisada pelo usuário, sem necessidade de outra chave da mesma conta. Nenhuma chave foi adicionada à conta QA nessa verificação e nenhum segredo foi incluído neste registro.

- A reclamação sobre rotação de `VAULT_KEYS_JSON` é condicional ao uso fora do ambiente local. A pergunta sobre compartilhamento dessa chave permanece sem resposta. Não foi feita rotação que pudesse invalidar credenciais em um ambiente externo desconhecido.
- Inspeção local em04/10/2026, sem imprimir segredos: `NODE_ENV=development`, URLs de banco em loopback, uma versão do cofre configurada e `backend/.env` ignorado pelo Git, sem rastreamento. O serviço já seleciona a versão ativa para novas criptografias e conserva a versão registrada em cada credencial para descriptografia. Esses fatos não demonstram se o arquivo foi copiado para outro ambiente; a condição externa permanece sem confirmação.

## Revisão da regra BYOK em04/10/2026

- Removidos os bloqueios `AI_KEY_ACCOUNT_MISMATCH` e `AI_KEY_IDENTITY_UNVERIFIED` da seleção/rotação. As chaves seguem a ordem escolhida, ignorando recusadas e temporariamente esgotadas; recusa ou limite permite tentar a próxima mesmo de outra conta Ollama. A seleção continua restrita às conexões do usuário do aplicativo.
- Regressões focadas:18/18 testes passaram (rotação, verificação de conexão e health do fornecedor), incluindo contas distintas, identidade ausente e ordem invertida. Typecheck e lint dos arquivos alterados passaram.
- Prova com fornecedor real: duas credenciais QA de contas Ollama distintas foram descriptografadas e recriptografadas apenas em memória para um solicitante de teste. A primeira tentativa recebeu um limite simulado; a segunda fez uma chamada real a `gpt-oss:20b` e retornou texto válido. Resultado:2 tentativas,1 resposta real,1 commit de cota simulado e0 escritas no banco. O teste demonstra fallback após falha induzida, não esgotamento real de quota; não adicionou nem copiou conexões entre usuários no banco.

## Comparação da Aula 02 — 04/10/2026

Conferidos o PDF de43 páginas e os resumos reais. A UI escondia os pontos principais e abria as referências na página1; agora mostra pontos e seções, agrupa fontes por documento e navega para a página citada. Corrigidos também título e mensagem sobre fontes na biblioteca, controles de raciocínio suportados para resumos e o timeout mascarado pelo retry do worker. Validação final:28 unitários,3 de integração e6 de navegador, mais typecheck/lint focados.

O modelo ainda produziu imprecisões conceituais. O novo resumo da validação foi revisado manualmente, identificado na tela e salvo com backup; o PDF e o resumo original foram preservados. Comparação, limites e evidências estão em `docs/VALIDACAO_RESUMO_BDI.md`. Nenhuma preferência de modelo ou chave foi alterada, e o limite local original de90s foi restaurado.
