# Validação do resumo da Aula 02 — 04/10/2026

## Material e comparação

PDF: `Aula 02 Arquiteturas de Agentes e Modelos BDI.pdf`, 43 páginas. O SHA-256 do arquivo fornecido corresponde ao documento utilizado pelo aplicativo (`ce3de3f1-02dc-4669-ac1b-92d6f98f940e`). Foram conferidos o texto completo e os diagramas do ciclo BDI (p. 22) e da organização (p. 31).

O resumo anterior (`6e0f768c-eae1-4b4a-af94-70d1725ae81e`) continha 12 pontos principais que a interface não exibia. Além disso:

- Crença aparecia como conhecimento; o original distingue crença de verdade e admite representações falíveis (pp. 17–18).
- O ciclo aparecia como uma sequência entre crenças e desejos; ambos alimentam a deliberação no diagrama (p. 22).
- A organização misturava os eixos de papéis, definição e poder (p. 32).
- A afirmação sobre eficiência da especialização não era sustentada pelo trecho original (pp. 36–37).
- A lista repetia o nome completo do PDF em 43 referências; os links ignoravam a página citada.

## Alterações

A tela exibe os pontos de revisão dos resumos antigos e novos. Novas gerações incluem seções explicativas com referências por seção, resolvidas no backend exclusivamente a partir do corpus autorizado. Referências inventadas são rejeitadas. O comando de geração exige preservar distinções, eixos de classificação e entradas paralelas dos diagramas.

As fontes consultadas ficam agrupadas por arquivo, recolhidas por padrão, com páginas únicas e ordenadas. As citações abrem a prévia PDF na página selecionada. O arquivo original e o resumo anterior são preservados.

## Verificação

- Unitários finais: 28/28 passaram, cobrindo referências autorizadas, controles de raciocínio suportados, comportamento padrão dos demais pedidos, rotação de chaves e timeout do worker.
- Integração da jornada de inteligência: 3/3 passaram, incluindo persistência das referências por seção e prévia autenticada.
- Navegador: 6/6 passaram, incluindo título do resumo e ausência de mensagem falsa sobre fontes na biblioteca; os 4 casos de conteúdo passaram, cobrindo resumos antigos e novos no desktop e mobile, fontes recolhidas, ausência de overflow e navegação para a página 22.
- Typecheck dos dois projetos e lint focado passaram.
- Computer Use no Chrome confirmou as páginas 22/43 (ciclo BDI) e 32/43 (eixos de organização), o resumo revisado salvo e a leitura no viewport mobile de 390 × 844, sem overflow horizontal.

## Geração real e timeout

Duas gerações com o modelo escolhido pelo usuário (`nemotron-3-nano:30b`) excederam 90 segundos por tentativa. Aumentar o orçamento de saída para 5.000 tokens não foi mantido: a implementação final conserva 3.000 tokens e pede entre 500 e 800 palavras, com até 8 seções.

As três tentativas de transporte do serviço de IA eram seguidas por uma repetição do worker; a reserva de concorrência já liberada impedia essa repetição e mascarava o timeout como `INVALID_STATE`. O worker agora encerra esse caso com `PROVIDER_TIMEOUT`, preservando a política existente para limite do fornecedor. Um teste específico valida o erro, a liberação da cota e a ausência de repetição pelo worker.

O limite local `AI_REQUEST_TIMEOUT_MS` foi aumentado temporariamente de 90.000 para 180.000 ms durante o diagnóstico; esse aumento não resolveu a chamada inicial. A configuração original de 90.000 ms foi restaurada.

O `/api/show` real anunciou controles `[false, true]`, com raciocínio ligado por padrão. Para resumos, o adaptador agora consulta os controles: escolhe `false` quando permitido ou `low` quando anunciado; caso contrário, conserva o padrão do modelo. Demais gerações não consultam esses metadados. A documentação oficial descreve esses controles: [Thinking — Ollama](https://docs.ollama.com/capabilities/thinking).

Com o controle compatível, uma chamada respondeu em 19.558 ms; diagnósticos seguintes variaram entre aproximadamente 13 e 38 segundos por chamada. Isso não é uma garantia de latência futura. O modelo e as chaves escolhidos pelo usuário foram preservados.

A conferência semântica mostrou que o modelo ainda confundia eixos e acrescentava afirmações sem apoio. Uma revisão automática pelo mesmo modelo foi testada, mas continuou deixando erros e foi removida para evitar duplicar o consumo sem benefício comprovado. O formato estrito do fornecedor Cloud também não pode ser imposto pelo parâmetro de saída estruturada; [a documentação oficial informa essa limitação](https://docs.ollama.com/capabilities/structured-outputs).

O comando recomenda até 5 referências por seção. O schema admite até 30 identificadores válidos; um número maior que a recomendação não causa rejeição por um limite de apresentação. Referências que não pertencem ao corpus continuam sendo rejeitadas. A validação dessas referências e do formato não comprova, por si só, que toda afirmação é fiel ao material.

## Resultado revisado e reversibilidade

O resumo criado durante a validação (`98a4775e-acfe-4b42-b404-539a28f074c7`) foi revisado manualmente por Codex contra o PDF, corrigindo definições, ciclo BDI, estratégias de compromisso, eixos de organização, redundância e especialização. Tem 8 seções e 9 pontos de revisão, com referências conferidas por seção. A tela identifica essa revisão; não se trata de uma aprovação automática do texto pela IA.

- Resultado: [abrir resumo revisado](http://localhost:3000/app/estudo/98a4775e-acfe-4b42-b404-539a28f074c7).
- Conteúdo revisado e metadados: `RESUMO_REVISADO_AULA_02.json`.
- Backup do texto gerado antes dessa revisão: `evidencias/resumo-bdi-antes-da-revisao.json`.
- Evidências visuais: `evidencias/resumo-bdi-desktop.png`, `evidencias/resumo-bdi-mobile.png` e `evidencias/resumo-bdi-mobile-leitura.png`.

A gravação foi limitada ao novo resumo da validação, utilizando a transação e a autorização do usuário no banco. O PDF, as referências autorizadas e o resumo original (`6e0f768c-eae1-4b4a-af94-70d1725ae81e`) foram preservados. O backup permite reverter a alteração do conteúdo.

Resultado dos checks finais: 28 unitários, 3 de integração e 6 de navegador passaram; typecheck e lint focado passaram, e o diff não contém erros de whitespace. Novos textos gerados pelo modelo ainda precisam de conferência semântica; este resultado específico foi conferido manualmente.

## Verificação adicional da extração

Na conferência seguinte, a camada de texto do PDF foi comparada com a entrada do parser: as quebras sinalizadas pelo `hasEOL` eram descartadas. O parser agora conserva essas quebras, e o chunker conserva a separação entre linhas ao montar o contexto. As versões do parser e do chunker foram atualizadas para distinguir os próximos processamentos. Nenhuma dependência foi adicionada.

- O teste com PDF real de várias linhas reproduziu a perda das quebras antes da correção e passou depois.
- 7 testes focados passaram (3 de extração/contexto e 4 de referências do resumo), assim como typecheck e lint focado do backend.
- O arquivo fornecido foi lido novamente: 43/43 páginas mantêm o mesmo texto, comparado após normalizar whitespace, e conservam quebras nativas. Os trechos das páginas 22, 23 e 32 foram conferidos separadamente. Evidência: `evidencias/pdf-texto-quebras-bdi.json`.
- O Chrome confirmou que o resumo revisado continua disponível com as 8 seções e os conceitos corrigidos.

Essa mudança vale para novos processamentos. O documento já enviado e seus artefatos não foram reprocessados nem invalidados. Preservar quebras não recupera setas ou relações espaciais de diagramas: a página 32, por exemplo, não sinaliza quebras entre seus três eixos. Não foi realizada nova geração na nuvem nesta etapa, portanto não há comprovação de melhora semântica automática. A necessidade de conferir novos resumos permanece.
