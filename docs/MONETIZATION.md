# Monetização

Planos e preços configuráveis, sem condicionais por nome espalhadas nas features. Entitlement não concede papel pedagógico. Gateway não integra nesta etapa.

## Quatro planos propostos

| Plano provisório | IA | Direitos propostos |
|---|---|---|
| Livre | BYOK opcional | Limites diários, documentos/storage reduzidos |
| IA Própria | BYOK | Maior limite, menor preço |
| Completo | IA da plataforma | Quota ampliada, estudo e exports |
| Professor Pro | Plataforma ou BYOK | Turmas, versões, mais storage/gerações |

Nomes/valores não definitivos. Free tem assinatura zero, não fornecedor ilimitado. Institucional é evolução comercial/contextual do quarto plano, sem interface administrativa completa agora.

## Entitlements

```text
AI_BYOK_ACCESS
AI_PLATFORM_ACCESS
RAG_ACCESS
ASSESSMENT_GENERATION
ASSESSMENT_VARIANTS
PDF_EXPORT
DOCX_EXPORT
MAX_DOCUMENTS
MAX_STORAGE_BYTES
MAX_CLASSES
DAILY_STUDY_SESSIONS
DAILY_GENERATIONS
MAX_CONCURRENT_AI_JOBS
```

Valores boolean/numeric/unlimited explícitos e versionados. UNLIMITED_STUDY_SESSIONS comercial não remove rate limit/concorrência/proteção antiabuso. Features consultam resolver, não `if (plan === "premium")`.

## Quotas/reservas

- Período diário documentado; proposta inicial UTC.
- PostgreSQL é fonte de counters/reservas, não apenas Redis.
- Reservar antes da operação/upload.
- Atualização atômica impede overspend concorrente.
- Unique operation/metric e confirmação/refund idempotentes.
- Expiração/reconciliação de reserva abandonada.
- Sucesso confirma conforme política; falha libera quando aplicável.
- Tentativas externas continuam registradas e sujeitas ao orçamento técnico.
- Original mantido em falha continua ocupando storage.
- Downgrade não apaga material; impede crescimento acima do limite.
- Plano/key não determina autorização de curso/prova.

Valores exatos pendentes; não inventar preço, quota diária ou teto.

## Descontos

DiscountRule: eligibility_type, percentual, stack_policy, cap, validade, status e versão. Elegibilidade exige comprovação técnica/contratual. Integração conectada não concede desconto automático. Aplicação no próximo ciclo explicitada. Sem 5% ou 100% hardcoded.

### Bloqueio de pooling

Não reutilizar, emprestar, revender, compartilhar ou usar key de cliente para outro cliente/projeto. Somente BYOK individual neste plano. Benefício comercial não implica permissão de uso cruzado.

Antes de qualquer mudança: documentação/termos atuais, limites, credential sharing, uso comercial e política multi-account, com autorização clara registrada. Sem autorização, mecanismo permanece desativado.

FATO VERIFICADO em 02/10/2026: página Ollama declara uma conta por pessoa e uso por tokens/créditos; não usar contas múltiplas para ampliar quota. Valores do provedor não se tornam preços do Facilita Estudo. [Pricing/contas](https://ollama.com/pricing).

## IA da plataforma

Credential própria, payer identificado, orçamento por usuário/feature/modelo. Fornecedor e contrato precisam validação antes de ativação. Não usar BYOK de terceiros como capacidade ociosa. Sem fallback silencioso que mude pagador.

Custos: tokens measured/estimated/unknown, price_version/moeda, latência/sucesso; não guardar prompts em telemetria. Custo BYOK separado da plataforma. CPU/storage embedding medidos à parte. Receita versus custo por usuário/período prepara unit economics; custo estimado não é fatura real.

## Cobrança futura

Conceitos: Plan, Subscription, Entitlement, UsageLimit/Counter, UsageReservation, UsageEvent, DiscountRule, Invoice e PaymentProvider.

```text
PaymentProvider
  createCheckout()
  getSubscription()
  cancelSubscription()
  verifyWebhook()
  parseWebhook()
```

Gateway só escolhido na entrega específica. Webhook com assinatura, dedup e transições idempotentes. Subscription: ACTIVE/PAST_DUE/CANCELED; cancel_at_period_end separado.

Antes de gateway: concessão controlada em piloto, catálogo e entitlements; não anunciar checkout funcional. Invoices e provider refs entram com cobrança efetiva.

## Pendências

Nomes/preços, limites, unidade faturável, descontos elegíveis, fornecedor cloud, contrato BYOK, gateway, impostos/documentação e critérios para venda pública. Validar sem parecer jurídico inventado.
