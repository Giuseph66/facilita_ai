# Erros e reproduções

Achados separados por severidade e natureza. P2 indica impacto relevante na confiança/continuidade do fluxo; P3 indica problema de clareza ou acabamento com alternativa funcional. Diagnósticos de código abaixo foram comunicados pelo agente principal e não devem ser confundidos com observação visual isolada.

## P2 — defeitos funcionais ou de estado

### D-01 — Criar turma conclui no servidor, mas a interface informa falha e sucesso

**Natureza:** bug de frontend e feedback. **Estado:** reproduzido e persistência confirmada após reload.

**Passos:** em Turmas, preencher e enviar a criação da turma QA Fotossíntese; observar as mensagens; recarregar a tela.

**Esperado:** um único feedback de sucesso, formulário limpo e lista atualizada. **Observado:** “Ação não concluída / Não foi possível conectar ao serviço…” e “Atualização concluída / Turma criada” aparecem simultaneamente; a lista não atualiza e o formulário permanece preenchido. Após reload, a turma existe com zero estudantes. Depois da matrícula do aluno, a tela passou a mostrar um estudante.

**Risco:** docente pode repetir a criação e gerar duplicata. O agente principal localizou a causa no frontend `courses-screen.tsx`: `event.currentTarget.reset()` ocorre depois de um `await`, quando `currentTarget` já está nulo, provocando erro após a API concluir. A mensagem genérica de rede mascara o sucesso real.

### D-02 — Exportação de dados mostra erro junto com sucesso

**Natureza:** bug de feedback. **Estado:** pedido concluído e download observado.

**Passos:** em Configurações › Privacidade, enviar o pedido de exportação usando a senha QA; observar a resposta e abrir o link disponibilizado.

**Esperado:** feedback de sucesso coerente e campo de senha limpo. **Observado:** “Pedido não enviado / Não foi possível conectar…” junto com “Pedido registrado…”. A solicitação foi marcada como concluída, link válido até 10/10 foi apresentado e o arquivo JSON foi baixado; campo de senha não limpou.

**Risco:** induz nova solicitação e reduz confiança.

**Diagnóstico de fonte comunicado pelo agente principal:** em `settings-screen.tsx`, o handler de exportação chama `event.currentTarget.reset()` após um `await`; nesse ponto `currentTarget` pode ser nulo, gerando exceção depois da resposta da API. Isso é consistente com o erro visual após a exportação concluída e com o campo não limpo. A observação visual e a análise de código são evidências distintas.

### D-03 — Preferência de modelo de IA não reaparece após recarga

**Natureza:** bug de estado apresentado. **Estado:** sequência observada e diagnóstico de frontend comunicado pelo agente principal.

**Passos:** selecionar `gpt-oss:20b`, salvar e recarregar a configuração de IA.

**Esperado:** o seletor mostra o modelo previamente salvo. **Observado:** após salvar, a UI confirmou; no reload mostrou o primeiro modelo da lista. A ordem da lista variou entre recargas.

**Diagnóstico comunicado:** `ai-settings.tsx` carrega conexões/modelos mas não busca a preferência salva no carregamento; inicializa a seleção com o primeiro modelo. Não há evidência de que a preferência persistida no backend tenha sido apagada nem de qual modelo uma geração usaria. O defeito confirmado é o estado visual enganoso, que pode levar a salvar outro modelo sem intenção.

### D-04 — Roteiro falha ao salvar códigos de competência vazios

**Natureza:** desencontro de contrato/validação UI/API. **Estado:** reproduzido; roteiro salvo depois de preencher códigos.

**Passos:** na turma QA, selecionar quatro assuntos e tentar “Salvar rascunho” deixando códigos de competência vazios; em seguida preencher códigos `QA-BIO` para os quatro itens e salvar novamente.

**Esperado:** se os códigos forem opcionais, salvar sem eles; se obrigatórios, indicar o campo e explicar a exigência. **Observado:** primeira tentativa retorna “Confira campos destacados”, sem orientação útil na árvore acessível; ao preencher os códigos, o roteiro é salvo como rascunho e aparece a confirmação “Atualização concluída”.

**Diagnóstico comunicado:** a UI envia `competencyCode: null`, enquanto o schema espera string com valor padrão `''`. Não se conclui que o produto deva exigir códigos; o bug é o contrato incompatível e a validação genérica.

## P3 — texto, affordance ou clareza

### D-05 — Texto de quota de turma sugere renovação temporal

**Natureza:** UX/copy. **Estado:** limite aplicado corretamente; severidade P3.

**Passos:** no plano Livre com uma turma criada, tentar criar uma segunda.

**Esperado:** explicar que a cota de uma turma é total no plano e indicar o que o usuário pode fazer. **Observado:** tela mostra 1/1, aviso “até o limite reiniciar” e resposta “O limite deste período foi atingido”. A segunda turma não foi criada; acesso de leitura/edição continuou. O agente principal classifica como P3 porque o bloqueio funcional está correto e o defeito é de copy.

### D-06 — “Mover questão 1 baixo” habilitado com uma questão

**Natureza:** affordance. **Estado:** observado na avaliação manual.

**Esperado:** desabilitar controles de movimento quando não existe outra questão. **Observado:** ação “Mover questão 1 baixo” aparece habilitada com apenas uma questão. Evidência: [avaliação manual](evidencias/avaliacao-manual.jpg).

### D-07 — Pluralização para um estudante

**Natureza:** UX/copy. **Estado:** observado após matrícula.

**Observado:** contadores exibiram “1 estudantes” e “1 matrículas”. Para uma unidade, usar singular. Evidência: [roteiro-codigos.jpg](evidencias/roteiro-codigos.jpg).

### D-08 — Rótulo “Tutor” é ambíguo na navegação mobile

**Natureza:** UX/copy. **Estado:** observado em viewport 390×844.

O acesso de IA pela barra inferior aparece como “Tutor”, menos explícito que “Estudar com IA”. O menu e navegação funcionaram e não houve overflow. Evidência: [IA mobile](evidencias/ia-mobile.jpg).

### D-09 — Página estática de confirmação de exclusão pode parecer ação real

**Natureza:** copy/estado de página, não segurança. **Estado:** abertura direta sem solicitação.

**Passos:** abrir `/pedido-de-exclusao-recebido` diretamente, sem enviar exclusão.

**Observado:** texto afirma que a solicitação foi aceita, o acesso encerrado e a sessão finalizada. A navegação não excluiu a conta; o agente principal confirmou que a conta continuava ativa após cancelar a prévia de exclusão. Classificado como P3/informativo; não é evidência de falha de autorização nem de exclusão real.

## Observações não confirmadas como defeito

- Ao salvar avaliação vazia, apareceu “Confira campos destacados”; a árvore acessível não identificou quais eram os campos e não foi possível confirmar visualmente se houve destaque. É uma indicação de feedback pouco verificável, não um bug confirmado.
- A primeira questão de múltipla escolha surgiu com alternativa A marcada como gabarito. A seleção estava visível; recomenda-se confirmar se esse padrão é intencional, pois pode deixar resposta errada se não for percebida.
- Salvar perfil sem alteração e navegar não permitiu confirmar mensagem de feedback.
- Upload, geração assistida, estudos e conteúdo compartilhado ficaram bloqueados por pré-requisitos/ferramenta; não classificar a ausência de resultado como defeito do produto.
