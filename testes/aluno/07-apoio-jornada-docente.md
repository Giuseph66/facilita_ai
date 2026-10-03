# 07 — Apoio pontual à jornada docente

Esta seção preserva observações feitas no Chrome ao ajudar a coordenação, separadas dos resultados de aluno. A jornada docente completa e seu relatório são responsabilidade da agente docente.

## Upload da fixture

- Disciplina QA: “Biologia QA 20261003”; turma QA “Turma QA Fotossíntese”. A disciplina e turma foram criadas pela coordenação/agente docente, não pelo agente aluno.
- Formulário “Adicionar material” oferecia título, PDF/PPTX, classificação Acadêmico (pode ser liberado por turma) ou Secreto da docente (não compartilhável), com a regra “Todo material começa privado até uma liberação por turma”.
- A fixture planejada era PDF sintético didático sobre fotossíntese. A seleção assistida via UI não completou: o Chrome extension API recusou `fileChooser.setFiles` com instrução sobre “Allow access to file URLs”. A tentativa única pós-recarga e a tentativa posterior à confirmação do usuário retornaram o mesmo erro. Nenhum upload foi enviado pelo agente.
- Uma tentativa de abrir `chrome://extensions` para verificar a permissão foi bloqueada pela política de URL do navegador. Não houve tentativa de contornar o bloqueio nem alteração de extensão.
- O usuário informou que selecionou e enviou manualmente. Ao observar a mesma disciplina QA no Chrome, o agente encontrou “Sem materiais por enquanto”, formulário vazio, sem ID/job/link. Uma recarga manteve esse estado. A interface divergente não prova que nada foi enviado em outra aba/sessão; tampouco permite declarar upload concluído.
- O formulário foi deixado visível com nome QA preparado e sem arquivo selecionado/submissão, a pedido da coordenação, antes do relato de envio manual.

## Avaliação privada QA

- A coordenação informou que o usuário confirmou o diálogo necessário. O agente não repetiu confirmação nem finalizou a avaliação.
- A avaliação “Avaliação privada QA - Fotossíntese” abriu como `READY`/“Pronta para finalizar”, revisão 3, privada, uma questão. Questão sintética sobre onde ocorre o ciclo de Calvin; gabarito marcado como privado. Resposta A “No estroma do cloroplasto”, opção B “Na membrana plasmática”. Nenhum desses dados apareceu na interface do aluno.
- Mensagem dizia que prova e gabarito seriam arquivos separados; a UI oferecia PDF e formato para impressão para ambos, além de “Criar cópia para editar”.
- Um clique em prova PDF e um em gabarito PDF exibiram “Trabalhando no seu pedido — Exportação da avaliação”; nenhum evento de download chegou em 15 s. O agente não finalizou avaliação.
- Depois que a coordenação disse que o worker voltara, houve um clique adicional em prova PDF. A espera de 30 s terminou com o UI ainda “Trabalhando no seu pedido”; nenhum link ou endpoint de arquivo apareceu no DOM/UI depois de abrir novamente o detalhe. Não houve clique adicional em gabarito.
- A coordenação reportou operacionalmente quatro jobs `ASSESSMENT_EXPORT` `SUCCEEDED`, outbox `DONE`, tentativa 1. O dado SQL não substitui prova visual de arquivo disponível. Não afirmar falha do worker.
- Lista da disciplina exibiu `READY` com “— questões”/sem contagem, mas detalhe mostrava uma questão. Registrar como divergência da UI docente.

## Relevância para aluno

Sem publicação/compartilhamento de material confirmado, os testes dependentes de fonte e estudo permaneceram bloqueados. O estado de privacidade do aluno não revelou a questão/gabarito docente; o agente não forçou rotas de avaliação fora do papel estudante.
