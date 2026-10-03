# Evidências textuais de diagnóstico

Transcrição dos resultados já coletados durante a auditoria. Não é screenshot, log completo nem nova execução. Consultas foram limitadas às duas contas QA; não incluíram payloads de jobs, ciphertext de chaves ou credenciais de conexão.

## Fila antes da intervenção

Quatro jobs `AI_CONNECTION_CHECK` estavam `QUEUED`, estágio `QUEUED`, sem erro/conclusão. Eventos de outbox estavam `PENDING`, com zero tentativas e sem lock. Essa observação sustentou o bloqueio de processamento, não falha das chaves.

## Resultado depois da intervenção autorizada

| Criação do job (UTC) | Feature | State/stage | Error code | Outbox / tentativas |
|---|---|---|---|---|
| 2026-10-03 19:20:04.090 | AI_CONNECTION_CHECK | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:21:20.457 | AI_CONNECTION_CHECK | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:21:54.373 | AI_CONNECTION_CHECK | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:22:48.208 | AI_CONNECTION_CHECK | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:48:17.361 | ASSESSMENT_EXPORT | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:50:29.137 | ASSESSMENT_EXPORT | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:51:39.745 | ASSESSMENT_EXPORT | SUCCEEDED / COMPLETED | null | DONE / 1 |
| 2026-10-03 19:51:42.369 | ASSESSMENT_EXPORT | SUCCEEDED / COMPLETED | null | DONE / 1 |

Os horários acima são criação dos jobs, não conclusão. Não atribuímos esses quatro exports individualmente a um botão sem correlação de ID. Depois dessa consulta, o aluno fez um reteste de prova que permaneceu trabalhando por 30 segundos; não há estado de banco correlacionado desse último pedido neste conjunto.

Uma verificação de conexão Redis respondeu `PONG`. Isso prova disponibilidade naquele instante, não saúde de todo o pipeline ou causa da falha anterior.

## Tentativas de recuperação do worker

1. Notificar o watcher atualizando o arquivo de entrada sem alterar conteúdo não mostrou mudança de PID.
2. Iniciar instância temporária carregou os módulos e processou os jobs acima.
3. Encerrar o filho antigo do worker levou o watcher a iniciar novo filho. A API manteve o mesmo processo na verificação.
4. Encerramento gracioso da instância temporária não finalizou o processo; o término foi concluído com sinal forçado. Não havia job QA em execução na última consulta acima, mas não foi auditado backlog de outras contas.

Uma consulta diagnóstica inicial usou `users.email`, inexistente no schema observado; foi corrigida para `email_normalized`. Essa falha de consulta é do diagnóstico, não do aplicativo.

## Registro de limpeza

A restauração retornou `{ "restored": 2, "plan": "FREE" }`. Os registros estruturados estão em [planos-qa-restaurados.json](../../planos-qa-restaurados.json).

## Limites

Logs completos de terminal e todas as árvores AX não foram arquivados. Estes registros preservam os resultados concretos disponíveis; não substituem a captura de evidência no momento de um reteste futuro.
