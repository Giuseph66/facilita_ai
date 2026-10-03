# UX e melhorias

## Pontos que funcionaram bem

- A landing apresenta docente e aluno, chamada principal e navegação separada por recursos, funcionamento, planos e FAQ.
- Cadastro mostra as regras de senha antes do envio e diferencia os papéis; no formulário observado, docente vinha selecionado e não havia termo vinculante.
- O dashboard docente aponta ações iniciais úteis: criar disciplina, abrir turmas e preparar avaliação. Estado vazio de disciplinas oferece criação; estado vazio de turmas informa que as aulas começam ali e leva às disciplinas.
- A tabela de planos e os acordeões da FAQ abriram e ficaram legíveis no desktop. As respostas cobrem custo/cartão, dependência de IA, privacidade e liberação pelo professor, downgrade e exportação/exclusão.
- Convite informa prazo, limite de usos e que o código aparece uma única vez, permitindo compartilhá-lo com o aluno.
- Antes de o professor publicar, o aluno via estado vazio de materiais e roteiro. Não foi observado vazamento de material privado ou gabarito nessa etapa.
- A prévia de exclusão exige digitar `EXCLUIR` e confirmar a senha, além de oferecer cancelar antes de uma ação permanente.
- Em 390×844, a tela de IA não teve overflow horizontal. O menu abriu a navegação; Escape o fechou e devolveu foco ao acionador; o link Turmas fechou o menu e navegou.

## Melhorias recomendadas

1. **Unificar feedback de mutações.** A criação de turma e o pedido de exportação de dados não podem mostrar sucesso e falha simultaneamente. Exibir um resultado coerente com a resposta real, limpar formulário/campo após sucesso e atualizar imediatamente a lista.
2. **Persistir o estado exibido do modelo.** Ao abrir Configurações de IA, carregar a preferência salva em vez de selecionar o primeiro item da lista. Se a preferência não puder ser carregada, comunicar isso sem sugerir silenciosamente outra opção.
3. **Alinhar contrato e validação do roteiro.** Aceitar ausência de código se for opcional; se for necessário, marcar o campo e explicar o motivo. Evitar enviar `null` quando o schema exige string.
4. **Explicar quotas com termos estáveis.** Para limite total de turmas, remover “período” e “até reiniciar”; dizer que a conta atingiu o limite do plano e orientar o próximo passo disponível.
5. **Desabilitar ações sem efeito.** Com uma questão, desabilitar mover para cima/baixo; com campos inválidos, levar foco ao primeiro campo e ligar mensagem ao campo na árvore acessível.
6. **Revisar textos de contagem e navegação.** Usar singular em uma unidade (“1 estudante”, “1 matrícula”) e preferir “Estudar com IA” a “Tutor” quando esse for o destino.
7. **Tratar o código de convite como credencial de uso único.** Manter o aviso observado e avaliar oferecer reemissão/revogação clara caso o docente feche a tela sem copiá-lo.
8. **Distinguir página estática de conclusão real.** `/pedido-de-exclusao-recebido` deveria depender de uma solicitação válida ou evitar afirmar que a sessão terminou quando a rota é aberta diretamente.
9. **Melhorar consistência de feedback de salvamento.** Perfil e validação de avaliação precisam confirmar sucesso/falha e indicar campos de forma observável por teclado e tecnologia assistiva.

## Limites da avaliação UX

A avaliação combina inspeção direta e fatos reportados pelo agente principal/aluno; cada tabela de cobertura identifica o tipo de evidência. Não foi feito teste completo com leitor de tela, navegação por todas as telas em mobile, nem avaliação de todas as rotas em estados de loading/erro. A ausência desses testes não deve ser interpretada como aprovação.
