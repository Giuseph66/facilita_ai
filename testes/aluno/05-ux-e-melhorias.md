# 05 — UX: pontos positivos e melhorias

## O que funcionou bem

- Landing, cadastro e login separam visualmente tarefas e apresentam ações principais com nomes compreensíveis.
- As telas de disciplina e turma explicam privacidade e liberação. No estado de aluno, nenhum material privado, avaliação ou gabarito docente apareceu.
- Estados vazios de turma, disciplina, estudos e simulados explicam em linguagem simples a dependência de convite, disciplina ou material.
- A interface de estudos mostra quais formatos podem ser criados: resumo, cartões, plano, revisão e exercícios semelhantes.
- Em 390 × 844, os cartões do painel, turma, estudos e simulados empilharam de modo legível; menu hambúrguer e atalhos fixos funcionaram na amostra.
- A tela de privacidade explica que exclusão encerra o acesso e que exportação cria uma cópia protegida; a prévia pode ser cancelada.

## Melhorias recomendadas, priorizadas

### P2 — Unificar contexto de turma e disciplina

Turmas reconhece a matrícula; painel e lista de disciplinas não a mostram; rota conhecida do detalhe abre mesmo assim. Exibir explicitamente o espaço ativo/compartilhado e listar disciplinas acessíveis da turma reduziria a confusão. Se a turma ainda não tiver material, manter a disciplina visível com estado “sem conteúdo liberado” é mais orientador que dizer que não há disciplina.

### P2 — Explicar por que uma conversa não abre

O erro genérico não aponta um campo. A UI pode marcar requisito ausente, identificar que ainda não há disciplina/material, diferenciar limite do plano e sugerir o próximo passo sem apagar o que foi preenchido.

### P2 — Mostrar um único resultado na exportação de dados

O aviso vermelho “Pedido não enviado” coexistiu com o verde “Pedido registrado” e com exportação concluída. O fluxo deve limpar o estado anterior antes da nova solicitação, mostrar um único resultado e atualizar a lista de pedidos sem sugerir repetição.

### P2 — Conter conteúdo de exportação na largura móvel

A faixa de abas pode manter rolagem interna, mas “Solicitações recentes” não deve ampliar o documento para além de 390 px. Quebra/encurtamento visual do link e `min-width: 0`/envolvimento de texto no cartão são soluções possíveis a confirmar no código pela equipe responsável.

### P2 — Sincronizar estado de exportação de avaliações com o artefato

Após jobs que a coordenação relatou como `SUCCEEDED`, a UI ainda mostrou “Trabalhando no seu pedido” e não apresentou botão de download. Mostrar progresso, resultado, formato e link ao artefato ou erro recuperável evita deixar a pessoa sem saber se deve esperar ou repetir.

### P2 — Tornar estados da conexão de IA acionáveis

A linha “Não verificada” permaneceu enquanto a coordenação observou jobs de checagem; depois a coordenação relatou conclusão `SUCCEEDED`. A UI deve expor “na fila”, “verificando”, “verificada” ou um erro com orientação e atualizar sem exigir que a pessoa repita a checagem.

### P3 — Tratar autofill de campos sensíveis

Autofill do Chrome colocou dados anteriores em formulário de chave e em campo textual de confirmação de exclusão. O serviço não foi apontado como fonte; ainda assim, nomes/autocomplete dos campos e confirmação visual deveriam resistir a preenchimentos heurísticos inesperados. Usar `autocomplete` apropriado e limpar valores autofillados quando o usuário troca de conta pode reduzir enganos.

### P3 — Melhorar contagem e singular/plural de questões

Na tela docente de apoio, uma avaliação privada apareceu como “— questões”/lista sem contagem, enquanto o detalhe mostrou uma questão. Usar contagem consistente e concordância singular/plural aumentaria a confiança antes de exportar.

## Relações observadas

- A ausência da disciplina no painel/lista e a disponibilidade do detalhe por rota conhecida são compatíveis com uma inconsistência de contexto/consulta. É uma hipótese apoiada nos estados da UI, não diagnóstico conclusivo.
- Sem material, os estados de tutor, estudo e simulado não permitem avaliar a qualidade de resposta/gabarito; classificar a chave ou provedor como causa seria incorreto com as evidências atuais.
- A exportação da própria conta funcionou apesar do aviso vermelho; o feedback, não a geração do arquivo, foi a falha observada.
