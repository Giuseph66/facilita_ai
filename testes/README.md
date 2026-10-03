# Auditoria visual — Facilita Estudo

Coleta de 03/10/2026 com dois agentes Luna (`gpt-6-luna`, `xhigh`) e coordenação da thread principal. Este índice organiza tentativas, resultados, falhas, limitações e melhorias. A coleta terminou por instrução do usuário após o limite de uso; a retomada foi exclusivamente documental.

## Leitura dos relatórios

| Conjunto | Conteúdo |
|---|---|
| [Aluno](aluno/README.md) | Cadastro/login, matrícula, descoberta de conteúdo, tutor/estudo/simulado, configurações, privacidade, mobile e tentativas no Chrome. |
| [Docente](docente/README.md) | Disciplina, turma, convite, roteiro, avaliação manual, geração assistida, exportações, planos, interface e páginas públicas. |
| [Orquestrador](orquestrador/README.md) | Revisão crítica, prioridades ajustadas, diagnósticos de contrato, cobertura, dependências e estado final. |
| [Evidências do aluno](aluno/evidencias/README.md) | Registros textuais/métricas recuperados da sessão. Capturas temporárias não foram persistidas; não foram recriadas. |
| [Evidências do docente](docente/evidencias/README.md) | Capturas existentes e contexto de cada uma. |
| [Fixture PDF QA](fixtures/fotossintese-qa.pdf) / [renderização](fixtures/fotossintese-qa.png) | Conteúdo sintético usado nas tentativas de upload. Arquivo local não prova envio nem processamento. |
| [Planos originais](planos-qa-original.json) / [restauração](planos-qa-restaurados.json) | Registro do ajuste temporário autorizado e retorno das duas contas QA ao Livre, sem cobrança. |

## Situação da auditoria

**Parcial, com defeitos confirmados.** Cadastro/login, disciplina/turma, convite/matrícula, avaliação manual, roteiro com códigos e exportação de dados pessoais tiveram resultados concretos. Gerações de estudo, tutor com fontes, simulados, compartilhamento de material e inspeção do PDF da avaliação não foram concluídos.

O worker processou jobs QA acumulados após intervenção autorizada. Isso não encerrou a validação visual dos artefatos. Houve divergência entre a confirmação humana de envio de material e a ausência de material nas sessões QA observadas. Os relatórios preservam essa incerteza.

Nenhuma correção da aplicação foi implementada e nenhuma suíte/lint/build foi executada. As evidências não certificam todas as telas ou todos os papéis.

## Roteiro de correções e reteste

Esta sequência é um plano de trabalho futuro; não representa implementação já realizada. Primeiro leia [a revisão crítica](orquestrador/revisao-critica.md) para separar diagnóstico confirmado de hipótese.

| Ordem | Trabalho | Responsabilidade sugerida | Critério de conclusão |
|---|---|---|---|
| 1 | Garantir processamento estável da fila e correlacionar job/artefato/UI. | Backend/operação + QA | Novo job QA sai da fila, conclui ou apresenta falha explicada; interface reflete o estado final. |
| 2 | Corrigir reset assíncrono de formulários de turma e exportação pessoal (O-01/O-02). | Frontend | Um envio bem-sucedido mostra só sucesso, limpa campos apropriados e atualiza a lista; falhas reais apresentam só erro. |
| 3 | Alinhar contratos de roteiro e conversa (O-04/O-07). | Frontend/backend | Roteiro com códigos vazios segue regra explícita; título opcional de conversa funciona ou é removido de modo coerente. Erros indicam o campo. |
| 4 | Corrigir descoberta de turma/disciplina pelo aluno (O-05). | Frontend/backend | Após matrícula e novo login, painel, lista, seletores de estudo e tutor oferecem o contexto autorizado sem exigir URL conhecida. |
| 5 | Recuperar preferência de modelo no carregamento (O-03). | Frontend | Salvar e recarregar apresenta o modelo realmente persistido; ordem da lista não muda a seleção. |
| 6 | Resolver fluxo de upload QA com evidência de persistência e processamento. | QA + frontend/backend conforme diagnóstico | Material aparece com ID, arquivo/status e processamento READY. Conta, disciplina e classificação ficam identificadas. |
| 7 | Publicar roteiro e liberar material à turma; verificar limites de acesso. | QA docente/aluno | Aluno vê o conteúdo liberado; conteúdo secreto e avaliação/gabarito privados continuam restritos. Revogação e links diretos são testados separadamente. |
| 8 | Completar tutor, resumos, cartões, plano e simulados. | QA dos dois papéis | Criar, abrir, estudar, responder e concluir cada artefato; conferir fontes, resultados, estado persistido e qualidade do conteúdo. |
| 9 | Completar avaliação assistida, cópia e exportações. | QA docente | Rascunho gerado revisável, alterações persistidas, READY, PDFs baixados e inspecionados; respostas/gabarito seguem o escopo correto. |
| 10 | Corrigir overflow mobile de privacidade (O-06). | Frontend | Em 390 px, documento não transborda após exportação; links/status continuam legíveis e operáveis. |
| 11 | Refinar quota, pluralização, movimentos impossíveis e mensagens (P3). | Frontend/produto | Texto corresponde à regra; controles disponíveis têm ação útil; validação associa mensagem ao campo e preserva foco. |
| 12 | Fechar matriz de cobertura e registrar regressões. | Orquestração/QA | Cada rota tem ação, esperado/observado, evidência e resultado final; bloqueios não são contados como aprovação. |

## Coordenação da próxima rodada

1. Fixar uma versão do código e registrar alterações externas; esta coleta ocorreu com o repositório sendo alterado em paralelo.
2. Usar sessões com autenticação efetivamente separada. Grupos de abas Chrome não isolam cookies.
3. Confirmar os pré-requisitos: worker, plano QA autorizado, upload e material pronto. Evitar repetir geração enquanto o job anterior estiver na fila.
4. Docente cria/libera os objetos QA e informa IDs; aluno valida descoberta, acesso e uso; coordenador cruza os resultados.
5. Salvar evidência no momento da observação, com segredos ocultos e contexto de papel/rota/estado. Capturas não recuperáveis devem continuar identificadas como ausentes.
6. Encerrar ajustes temporários e atualizar o [estado final](orquestrador/estado-final.md).

Recuperação/redefinição de senha foi apenas inspecionada, e exclusão permanente não foi submetida. Esses fluxos precisam de cenário próprio e autorização adequada se incluídos numa rodada futura.
