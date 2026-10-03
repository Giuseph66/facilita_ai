# Pendências e reteste

Nenhuma ação abaixo foi iniciada após o usuário pedir encerramento dos testes. É uma lista para retomada futura, caso autorizada.

## Retestes prioritários

1. **Upload:** destravar seleção do PDF/PPTX pela interface normal; confirmar que o arquivo aparece, processa e chega a estado pronto. Não assumir que a permissão informada pelo usuário resultou em material salvo: a conta QA ainda mostrava vazio.
2. **Conteúdo e separação de acesso:** liberar conteúdo explicitamente à turma; como aluno, validar leitura do material e confirmar novamente que documentos/provas/gabarito privados não aparecem antes da liberação.
3. **Roteiro:** retestar salvar com código vazio após correção; concluir publicação somente quando o diálogo nativo puder ser confirmado; validar o estado publicado do aluno.
4. **IA:** confirmar na UI que jobs de verificação foram refletidos e executar uma geração pequena representativa, sem atribuir resultado ao provedor até a confirmação visual. Reabrir configurações para conferir o modelo selecionado.
5. **Exportar avaliação:** repetir em uma sessão estável o download de prova e gabarito, verificando se ambos chegam ao navegador após o worker ativo; manter prova privada e não compartilhar o gabarito inadvertidamente.
6. **Rotas dinâmicas:** após obter dados, percorrer materiais, conversas, estudo, simulados e exports; incluir estados vazios, loading e erro quando disponíveis.
7. **Perfil e acessibilidade:** validar feedback de salvar perfil, foco dos campos inválidos, ordem de tabulação, foco do menu e rótulos em todas as telas principais.

## Cobertura incompleta conhecida

- `/app/estudo` e `/app/simulados` não foram percorridas.
- Rotas dinâmicas de estudo, simulado e conversa não tinham registros para abrir.
- Detalhe do material, processamento e liberação não foram confirmados na sessão QA. O usuário relatou que o envio/criação foi confirmado, mas a UI QA continuou sem material visível.
- Avaliação gerada por IA não foi criada.
- Publicação do roteiro foi somente tentada; não confirmar publicação.
- Houve um reteste adicional da prova após o worker temporário; ficou “Trabalhando” por 30 segundos, sem download. Os quatro jobs SUCCEEDED foram anteriores a esse reteste; o resultado não permite inferir o estado do novo job nem confirma novo teste do gabarito.
- A rota de exportação dinâmica não teve resultado visual de download confirmado.
- Redefinição de senha e exclusão permanente não foram solicitadas.
- Não houve varredura completa de acessibilidade nem teste mobile além da tela de IA e navegação.

## Estado final e encerramento

Ambas as subscriptions QA foram restauradas para FREE, conforme [`../planos-qa-restaurados.json`](../planos-qa-restaurados.json). Nenhuma exclusão permanente de conta ocorreu. O aluno estava matriculado na turma; o roteiro permaneceu rascunho; a avaliação ficou privada/READY conforme observação cruzada. O usuário relatou confirmação de envio do material, mas a sessão QA ainda não o mostrava. Worker `471215` informado ativo após o encerramento dos jobs temporários. O relatório não afirma que as chaves de API foram inválidas nem que exports da avaliação foram baixados.
