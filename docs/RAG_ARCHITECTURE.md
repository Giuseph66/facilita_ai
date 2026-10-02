# Documentos e RAG

## Ingestão

```text
upload autorizado → reserva storage → validação de formato/tamanho
→ original privado → Document + Outbox → parsing
→ páginas/slides → normalização → chunking → embeddings
→ versão completa → ativação atômica → READY
```

Original preservado mesmo em falha. Conta no storage até exclusão. Storage/DB não compartilham transação: compensação e reconciliação de órfãos obrigatórias. Falha DB não deixa arquivo público.

### StorageProvider

Contrato interno proposto: put(stream, metadados validados), get(key), head(key), delete(key). Key opaca gerada pelo servidor; nenhuma regra monta path com nome do usuário. LocalStorageProvider inicial; S3StorageProvider posterior. Download pela API autorizada, sem public URL no MVP.

### PDF

- Adapter PDF.js, confirmar compatibilidade em E11.
- Extração página a página, Unicode e ordem possível.
- Detectar texto vazio/insuficiente.
- PDF protegido/digitalizado tem erro claro; original mantido.
- Sem OCR silencioso ou texto inventado.
- Corpus de fórmulas/colunas; não prometer fidelidade visual perfeita.

### PPTX

- Adapter OOXML ZIP/XML; preservar ordem de slides.
- Texto e notas conforme configuração explícita.
- Não executar macros/objetos/links.
- Limitar entradas e tamanho descompactado; XML sem entidades externas.
- Imagens sem texto indicadas como não extraídas.
- PPT/ODP fora da primeira implementação, sem fingir suporte.

## Normalização e chunking

Preservar conteúdo acadêmico, numeração e proveniência. Limitar remoção de headers/footers para não destruir significado. Parser/chunker versionados.

DECISÃO NOSSA inicial:

- Alvo 300 tokens do tokenizer do embedding.
- Overlap 40 tokens.
- Máximo 480 tokens, reservando prefixo/especiais.
- Quebra por página/parágrafo; chunk não atravessa página.
- token_count, hash, posição, página e versão registrados.
- Não truncar silenciosamente texto maior que limite.

## Embeddings

DECISÃO NOSSA: E5 multilíngue pequeno CPU no worker via Transformers.js. Pesos fixados por revisão/hash, download controlado no setup; nada baixado por URL do usuário.

FATO VERIFICADO em 02/10/2026: conversão ONNX tem integração documentada com Transformers.js; modelo original tem dimensão 384, prefixos query:/passage: e limite de 512 tokens. [ONNX](https://huggingface.co/Xenova/multilingual-e5-small), [model card](https://huggingface.co/intfloat/multilingual-e5-small/raw/main/README.md).

Fingerprint inclui modelo, revisão, tokenizer, pooling e quantização. Query/documento usam mesmo fingerprint e normalização. Nunca comparar vetores de modelos distintos. Nova dimensão exige plano/migration explícitos.

HIPÓTESE: CPU atende piloto. E15 mede throughput/RAM/latência e qualidade em português. Adapter substituível caso hipótese falhe. CPU embedding é IA interna com custo de infraestrutura, não IA generativa grátis ilimitada.

## Busca autorizada

```text
pergunta → autorizar contexto/IDs → embedding query
→ SQL restrito a elegíveis → ranking → deduplicação
→ orçamento → revalidar permissão → LLM → validar citações
```

Restringir na consulta: workspace, ownership/release, matrícula, classificação, documento não excluído, versão ativa, fingerprint e materiais selecionados. RLS complementa filtro explícito.

Proibido top-k global seguido de filtro Node. Proibido enviar conteúdo secreto e pedir ao modelo sigilo. Avaliações/respostas/prompts não pertencem ao corpus estudantil.

Inicial: busca exata como baseline e B-tree para filtros. HNSW após medir necessidade, recall e performance. FATO VERIFICADO: filtros seletivos com índice aproximado podem reduzir quantidade de resultados; ajustes de recall não removem requisito de autorização. [pgvector](https://github.com/pgvector/pgvector).

Reranking e busca híbrida condicionados a evidência de qualidade insuficiente, sem fornecedor extra antecipado.

## Context builder/citações

```text
[SOURCE_3]
Material: Aula 04
Página: 17
Texto: ...
```

Modelo só cita IDs fornecidos. Backend resolve ID para documento/versão/chunk/página autorizados. Persistir resposta → fontes; não devolver storage_key.

- Sem contexto suficiente, explicitar limitação.
- Sem fonte relevante, não afirmar base documental.
- Revogação durante execução: abortar/recalcular antes de publicar.
- Histórico/summaries/artifacts herdam dependências.
- Fonte revogada: não mostrar resposta derivada sem reavaliação.
- MVP sem cache compartilhado de contexto acadêmico.
- Cache futuro inclui usuário/escopo/ACL version/fingerprint; jamais chave apenas por pergunta.

## Cobertura ampla

Top-k de pergunta não representa aulas inteiras. Prova/resumo abrangente:

1. Inventariar materiais e tópicos.
2. Distribuir orçamento entre materiais.
3. Planejar cobertura por páginas/tópicos.
4. Gerar em partes, se necessário.
5. Validar conjunto final/cobertura.
6. Informar limitações; não descartar material silenciosamente.

Questões de prova são persistidas só após validação global e sempre DRAFT. Não usar StudyBlueprint para recuperar dados da prova.

## Reprocessamento

Nova versão processa separadamente, ativada somente completa. Versão anterior mantém uso enquanto válida. Referências antigas preservam sua versão durante retenção. Exclusão/revogação bloqueia fontes e derivados; purge assíncrono remove original/texto/chunks/vetores conforme política.

## Segurança e qualidade

Documento é dado não confiável: delimitação, sem ferramentas privilegiadas, sem alteração de escopo por texto. Validação de citation IDs e markdown sanitizado. Segurança não depende exclusivamente de prompt.

Gate de leakage captura contexto enviado ao fake provider, além de analisar resposta. Corpus de duas turmas/tenants, material privado/liberado/revogado e prova com marcador único. Recall@10 inicial proposto ≥0,85 no corpus; validar limiar após spike. Zero chunks proibidos nos testes de isolamento.
