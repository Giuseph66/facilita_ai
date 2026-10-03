# QA visual — percurso do aluno

Coleta encerrada por instrução do usuário em 2026-10-03. Este pacote consolida o relatório anterior e as observações posteriores da sessão. Não foram repetidos testes após o encerramento.

O cadastro/login do aluno QA e a matrícula em uma turma funcionaram. As telas principais, porém, discordam sobre o acesso: a turma aparece em **Turmas**, o painel e a lista de disciplinas ficam vazios, e a rota conhecida da disciplina abre com tópicos, mas sem material. Assim, tutor com fontes, estudo gerado e simulado completo não puderam ser validados.

Achados prioritários: dashboard/lista não refletem turma e disciplina; início de conversa mostra erro genérico; exportação de dados mistura aviso de falha com sucesso; a tela de privacidade excede a largura móvel; o estado de exportação de avaliações não exibiu artefato no tempo observado. A coordenação informou que jobs de verificação e exportação terminaram `SUCCEEDED`, mas o reteste visual da prova continuou mostrando “Trabalhando no seu pedido” por 30 segundos. Não há evidência de chave rejeitada.

## Arquivos

- [Contexto e método](01-contexto-e-metodo.md)
- [Cobertura e resultados](02-cobertura-e-resultados.md)
- [Erros e reproduções](03-erros-e-reproducoes.md)
- [Tentativas e bloqueios](04-tentativas-e-bloqueios.md)
- [UX e melhorias](05-ux-e-melhorias.md)
- [Pendências e reteste](06-pendencias-e-reteste.md)
- [Apoio à jornada docente](07-apoio-jornada-docente.md)
- [Evidência textual consolidada](evidencias/observacoes-textuais.md)
- [Métricas móveis em JSON](evidencias/metricas-mobile.json)
- [Disponibilidade de capturas](evidencias/README.md)

## Estado final conhecido

- O aluno QA terminou com entitlement `FREE`, restaurado pela coordenação; ela informou que a alteração temporária para QA não gerou cobrança e registrou a restauração em `testes/planos-qa-restaurados.json`.
- Não foi possível confirmar material na disciplina: após a mensagem do usuário de que selecionou e enviou o arquivo, a interface observada ainda mostrou “Sem materiais por enquanto”, inclusive após uma recarga. Isso é uma divergência entre o relato de ação manual e o estado da tela; o upload não é declarado como bem-sucedido nem como falha da aplicação.
- Nenhuma senha, chave de API, código de convite, identificador de conta preexistente ou e-mail de outro usuário é incluído neste pacote.
- As capturas da sessão foram apenas transitórias no navegador/CUA e não estão disponíveis como arquivos. Os valores de layout e textos visíveis foram preservados como transcrição factual; não foram recriadas imagens.
