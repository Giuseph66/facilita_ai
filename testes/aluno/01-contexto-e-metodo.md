# 01 — Contexto e método

## Objetivo

Avaliar visualmente a experiência de estudante no Facilita Estudo local, cobrindo cadastro/login, acesso a turmas e disciplinas, tutor, estudo, simulados, conta, plano e privacidade. A tarefa original também pediu crítica de clareza, affordances, feedback, acessibilidade básica e responsividade.

## Ambiente e persona

- Data da coleta: 2026-10-03.
- Aplicação observada: `http://localhost:3000`; backend local informado pela coordenação em `localhost:3001`.
- Navegador: Chrome visível, sessão separada de navegação QA.
- Persona: conta sintética “Aluno QA 0310”, papel Acadêmico/`STUDENT`.
- Conteúdo/turma: contexto QA de Biologia/Fotossíntese criado na jornada docente coordenada. O código do convite e credenciais não são reproduzidos.

## Método

1. Cadastro, login, logout e nova autenticação foram feitos pela interface visível.
2. A conexão de IA foi configurada manualmente na interface com a chave QA fornecida para esse fim. O valor da chave foi omitido deste relatório e não foi enviado a outro serviço.
3. A turma foi acessada pelo fluxo de convite visível. A matrícula foi conferida em Turmas após reautenticação.
4. Rotas públicas e privadas foram percorridas pela UI. A rota de detalhe da disciplina usada na comparação já havia sido observada na sessão docente coordenada; o aluno não explorou URLs de usuários alheios nem chamou endpoints diretamente.
5. Uma medição somente de layout leu `innerWidth`, `scrollWidth` e larguras de contêineres para separar overflow da página do carrossel/aba rolável. Não foram usados REST, SQL, `fetch` ou scripts para executar ações na plataforma.
6. Foi solicitada uma exportação dos próprios dados QA. O evento de download foi confirmado, mas o pacote não foi aberto. A prévia de exclusão foi cancelada antes de qualquer pedido de exclusão.
7. Quando a ferramenta de upload bloqueou a seleção do PDF local, a coordenação pediu ao usuário seleção manual. O usuário informou que selecionou e enviou; a interface observada pelo agente continuou sem material, inclusive após uma recarga. O resultado fica registrado como divergente e inconclusivo.

## Limites

- Não havia material confirmado como liberado para o aluno, então pergunta com citação, abertura de fonte, resumo, flashcards, plano, exercícios, simulado respondido e resultado não puderam ser completados.
- O plano inicial era Livre. Mais tarde, a coordenação aplicou temporariamente entitlement QA para retestes e depois informou que restaurou a conta para `FREE`, sem cobrança. Não houve validação visual posterior dessa restauração.
- A tela de IA inicialmente mostrou “Não verificada”. A coordenação informou que os jobs QA foram processados como `SUCCEEDED`; esse dado é de coordenação, não de uma confirmação visual posterior do aluno. Portanto, nenhuma conclusão de chave inválida ou recusa do provedor é feita.
- O usuário encerrou novos testes por limite; este pacote não contém retestes após esse encerramento.

## Proteção de dados

Conta, senha, chave de API e convite foram tratados como dados de teste e omitidos. A conta anterior já autenticada no Chrome foi desconectada pelo menu sem abrir nem inspecionar seus dados. O campo autofill de confirmação de exclusão recebeu um dado de e-mail anterior do navegador; o valor não é reproduzido e nenhum pedido foi enviado.
