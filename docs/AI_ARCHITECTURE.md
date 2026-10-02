# Arquitetura de IA

## Princípios

Uma entrada central para IA; SDKs/HTTP específicos só nos adapters. Domínio não conhece fornecedor. BYOK individual, IA da plataforma com credencial própria, respostas não confiáveis e métricas sem conteúdo sensível.

## Ollama Cloud: fatos verificados em 02/10/2026

- API direta cloud usa key em Authorization: Bearer; não exige Ollama local.
- Nomes de modelos vêm do catálogo cloud; não presumir sufixos/nomes locais.
- Documentação atual informa ausência de structured outputs na cloud.
- Endpoint genérico /api/embed não prova disponibilidade por conta/modelo cloud.
- Uso atual descrito em tokens/créditos e concorrência por plano; sem promessa de capacidade gratuita ilimitada.

Fontes: [cloud](https://docs.ollama.com/cloud), [auth](https://docs.ollama.com/api/authentication), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [embed](https://docs.ollama.com/api/embed), [pricing](https://ollama.com/pricing).

VALIDAÇÃO NECESSÁRIA: revalidar catálogo/capacidades/termos no momento da integração. Não confundir documentação da biblioteca local com capacidade cloud.

## Contrato interno proposto

```ts
interface AIProvider {
  getModels(context: ProviderContext): Promise<ModelDescriptor[]>;
  healthCheck(context: ProviderContext): Promise<ProviderHealth>;
  estimateUsage(input: GenerationInput): UsageEstimate;
  generateText(input: GenerationInput, context: ProviderContext): Promise<GenerationResult>;
  chat(input: ChatInput, context: ProviderContext): Promise<GenerationResult>;
  generateStructured?(input: StructuredInput, context: ProviderContext): Promise<unknown>;
  createEmbedding?(input: EmbeddingInput, context: ProviderContext): Promise<EmbeddingResult>;
}
```

Capacidades opcionais declaradas no catálogo. Existir no contrato não significa suporte universal. E01 concretiza tipos, limites e capabilities. ProviderContext é server-only; nunca em DTO/log/job serializado.

| Serviço | Responsabilidade |
|---|---|
| AIProviderResolver | Seleção por feature, preferência, entitlement, capacidade e disponibilidade |
| CredentialsVault | Criptografia, leitura interna, rotação e exclusão |
| AIQuotaService | Reserva/confirm/refund, concorrência e reconciliação |
| AIUsageService | Cada tentativa, consumo, custo estimado e pagador |
| PromptTemplateService | Template/version/purpose/hash |
| StructuredGenerationService | Validação uniforme de JSON nativo/textual |
| EmbeddingService | Fingerprint igual para documento/pergunta |
| FakeAIProvider | Fixtures determinísticas, falhas e uso controlados |

Adapters: OllamaCloudProvider, PlatformAIProvider e embedding CPU. Plataforma pode usar fornecedor distinto, escolhido somente após validação; não adicionar integração especulativa.

## Resolução

```text
user + contexto + feature
→ autorização do recurso
→ entitlement
→ preferência BYOK/PLATFORM
→ capacidade/modelo
→ reserva de quota
→ credencial do titular correto
→ execução
→ usage por tentativa
→ validação
→ persistência/confirm ou fail/refund
```

- BYOK usa somente key do solicitante.
- PLATFORM usa somente key própria da plataforma.
- Nenhum fallback para usuário diferente.
- Nenhuma troca automática de pagador.
- Nenhuma transferência de dados a outro fornecedor sem preferência/política explícita.
- Modelo efetivo registrado por mensagem/operação.
- Indisponibilidade produz erro útil, sem fallback invisível.
- Circuit breaker futuro, se frequência de falhas justificar; timeout/concorrência vêm primeiro.

## Geração estruturada

1. Selecionar schema versionado.
2. Renderizar prompt da feature.
3. Usar schema nativo somente quando comprovado.
4. Caso contrário, pedir JSON via texto.
5. Parse limitado + Zod estrito.
6. Validar negócio/proveniência.
7. Até uma correção de formato, dentro do orçamento.
8. Falhar se inválido.
9. Persistir entidade somente após validação completa.

Validação de prova: total/distribuição corretos; IDs únicos; alternativa correta existente; rubrica conforme tipo; pontos válidos; fontes nos materiais selecionados; campos inesperados rejeitados. IA nunca escolhe IDs de fonte arbitrários válidos por aparência.

Resultado sempre DRAFT. Schema válido não comprova correção pedagógica. Professor revisa antes de READY/PUBLISHED. Resposta parcial/inválida não vira avaliação; logs não guardam corpo bruto para depuração.

## Timeout, retries e falhas

DECISÃO NOSSA inicial, configurável: chamada generativa 90 s, deadline de job 10 min, até três tentativas de transporte, backoff exponencial/jitter, Retry-After quando fornecido. Esses números não são limites da Ollama.

- Não repetir 401 ou capacidade incompatível.
- Repair estrutural tem orçamento distinto e limitado.
- Não multiplicar tentativas ilimitadamente entre adapter/fila/repair.
- Timeout com custo incerto registra unknown; não custo zero.
- Worker interrompido reconcilia estado antes de repetir.
- Idempotência de persistência não garante chamada externa/cobrança única.

Falhas públicas: PROVIDER_AUTH_FAILED, MODEL_UNSUPPORTED, PROVIDER_RATE_LIMITED, PROVIDER_TIMEOUT, AI_OUTPUT_INVALID, CONTEXT_TOO_LARGE, PROVIDER_NOT_CONFIGURED. Resposta bruta externa não chega ao usuário/log.

## Credenciais

AES-256-GCM, nonce aleatório, AAD com connection/user/provider, chave mestre externa ao banco/Git e key_version. Máscara e status retornam; key integral nunca retorna após salvar. Não capturar body dessa rota. Revogação/rotação invalida novos jobs e pending jobs revalidam credential_revision. Health distingue conectividade/auth/capacidade; indicar eventual consumo pago.

Sem pooling ou compartilhamento. Desconto não implica autorização para usar key de cliente em outro contexto. [SECURITY.md](SECURITY.md), [MONETIZATION.md](MONETIZATION.md).

## Prompts/versionamento

```text
packages/backend/src/ai/prompts/
  tutor/v1/
  summary/v1/
  assessment/v1/
  practice-test/v1/
  flashcards/v1/
  study-plan/v1/
```

Cada template: name, version, purpose, schemaVersion e hash. Sem strings grandes espalhadas. Proveniência registra provider/modelo efetivo, template/schema, configurações privadas, versões/fontes, actor/job/time. Instrução docente necessária fica em registro privado; não telemetria.

## Uso/unit economics

Cada tentativa, inclusive falha: actor, payer, provider, model, feature, input/cached input/output tokens, origem measured/estimated/unknown, preço versionado/moeda, estimatedCost nullable, latência, sucesso, erro seguro e timestamp.

- Estimativa não é fatura real.
- Consumo desconhecido não é zero.
- BYOK tem custo do usuário separado do custo da plataforma.
- Embeddings CPU/storage têm métricas próprias.
- Comparar receita versus custo por usuário/período no futuro.
- Não guardar conteúdo sensível desnecessário em logs/traces.

## Embeddings

Modelo proposto: Xenova/multilingual-e5-small, via Transformers.js no worker. Vetor 384; query/passages com prefixo adequado; pooling/normalização compatíveis; modelo/tokenizer/revisão/quantização fixados. Qualidade/CPU/RAM ainda hipótese a medir na E15. Sem exigência de Ollama local.

Índice não depende da key do usuário. Free pode receber embeddings dentro de quota configurada, sem promessa de geração cloud grátis. [RAG_ARCHITECTURE.md](RAG_ARCHITECTURE.md).

## Testes

Fake provider/fake HTTP para sucesso, 401/429/timeout, tokens ausentes, schema inválido, repair, revogação e quotas. Cloud real separado, opt-in, credencial de teste e orçamento autorizado. Nenhuma suíte determinística depende exclusivamente de LLM real.
