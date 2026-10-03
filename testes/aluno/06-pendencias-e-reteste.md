# 06 — Pendências e cobertura não concluída

O usuário encerrou novas ações por limite. Esta lista documenta o que ficou sem prova, não uma autorização para retomar agora.

## Bloqueios de jornada

- Material da disciplina: o usuário informou que selecionou e enviou o PDF, mas na sessão Chrome observada o detalhe ainda mostrou “Sem materiais por enquanto” após recarga; não havia ID/job/link. Status final inconclusivo.
- Lista e painel: retestar somente se o material/matrícula for corrigido; atualmente a turma consta em Turmas, mas dashboard e lista de disciplinas estão vazios.
- Tutor: pergunta baseada no material, citações, abertura de fonte e resposta não testadas.
- Estudo: resumo, cartões, plano/revisão e exercícios não gerados.
- Simulado: criação, respostas antes/depois de entrega, envio e correção não testados.
- Entitlement: coordenação restaurou as contas QA para `FREE`; não houve nova inspeção visual após restauração.

## Exportações

- Exportação de dados do aluno: download confirmado, pacote não aberto. Nenhuma inspeção do conteúdo foi feita por cautela com dados de configuração.
- Prova e gabarito docente: dois pedidos UI (prova PDF e gabarito PDF) mostraram processamento sem download em 15 s. Após worker novo, um pedido adicional de prova continuou “Trabalhando no seu pedido” por 30 s e nenhum link apareceu. A coordenação relatou quatro jobs `ASSESSMENT_EXPORT` `SUCCEEDED`/outbox `DONE`; não há confirmação visual de artefato baixável.
- Não foram explorados formatos “para impressão” nem cópia de avaliação; avaliação não foi finalizada.

## Telas e fluxos sem julgamento

- Avaliações do ponto de vista do estudante e tentativa de acesso a uma prova publicada.
- Conteúdo liberado e material secreto do docente comparados após publicação (não havia material visível para aluno).
- Perguntas com fonte/citação, fontes abertas, resumos, cartões, plano, exercícios, simulado enviado e gabarito após entrega.
- Resposta visual à conclusão de jobs IA após a coordenação informar `SUCCEEDED`.
- Estado de privacidade em larguras maiores/sem solicitação recente; confirmou-se overflow apenas no estado observado após exportação.
- Verificação visual final do entitlement restaurado.

## Não fazer conclusões não sustentadas

- Não dizer que chave é inválida ou que Ollama recusou: há relato operacional posterior de jobs de conexão QA `SUCCEEDED`.
- Não declarar que o PDF foi criado ou processado: a UI observada não exibiu item, ID ou estado; há apenas o relato manual do usuário de envio.
- Não declarar que o worker falhou: a coordenação reportou export jobs `SUCCEEDED`; a evidência do agente é que a UI continuava “Trabalhando” e não revelou link.
- Não afirmar vazamento pelo autofill do Chrome: a coordenação tratou os campos pré-preenchidos como autofill; nenhum valor antigo foi enviado pela agente.
