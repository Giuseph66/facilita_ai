# Auditoria visual — docente

Registro consolidado da jornada docente na plataforma, executada em 03/10/2026. A sessão foi encerrada por orientação do usuário; este material organiza apenas observações já coletadas. Nenhuma chave de API, senha ou código de convite está reproduzido aqui.

## Resultado principal

A conta QA docente foi criada, autenticada, vinculada a uma disciplina e turma, e usada para preparar um roteiro em rascunho e uma avaliação privada pronta. A matrícula do agente aluno e a privacidade anterior à publicação também foram conferidas. O usuário relatou confirmação de criação/envio do material, mas a interface da conta QA continuou sem material visível; por isso, processamento e liberação não foram validados. Geração com IA, publicação do roteiro e download de prova/gabarito permanecem sem validação final.

Os defeitos de maior impacto observados foram quatro problemas P2: a criação da turma persiste mas apresenta erro e sucesso ao mesmo tempo; a exportação de dados também combina erro e sucesso apesar de concluir; o seletor de modelo de IA não reabre a preferência salva; e o salvamento do roteiro falha quando códigos de competência estão vazios devido a um desencontro `null`/string no contrato UI/API. A fila/worker foi um bloqueio ambiental durante parte da sessão; não há base para atribuir falha às chaves fornecidas.

## Arquivos

- [01 — contexto e método](01-contexto-e-metodo.md)
- [02 — cobertura e resultados](02-cobertura-e-resultados.md)
- [03 — erros e reproduções](03-erros-e-reproducoes.md)
- [04 — tentativas e bloqueios](04-tentativas-e-bloqueios.md)
- [05 — UX e melhorias](05-ux-e-melhorias.md)
- [06 — pendências e reteste](06-pendencias-e-reteste.md)

## Evidências

- [Avaliação manual](evidencias/avaliacao-manual.jpg)
- [IA em viewport mobile](evidencias/ia-mobile.jpg)
- [Modelo de IA salvo (campo de credencial mascarado)](evidencias/modelo-salvo.jpg)
- [Plano Livre](evidencias/plano-livre.jpg)
- [Feedback da exportação de privacidade](evidencias/privacidade-feedback.jpg)
- [Roteiro salvo como rascunho](evidencias/roteiro-codigos.jpg)

A captura do seletor de IA contém apenas a representação mascarada apresentada pela interface; o trecho mascarado não foi transcrito. A restauração final dos planos das contas QA para FREE está registrada em [`testes/planos-qa-restaurados.json`](../planos-qa-restaurados.json).

## Critério de leitura

`PASSOU` significa que a ação descrita teve resultado coerente observado; `FALHOU` marca defeito reproduzido; `BLOQUEADO` indica pré-requisito/ferramenta/ambiente que impediu concluir; `VISITADA` registra inspeção de tela sem validar todas as ações; `NÃO TESTADO` indica que a etapa não foi percorrida. Em cada achado, fatos observados estão separados de diagnósticos de código e hipóteses de UX.
