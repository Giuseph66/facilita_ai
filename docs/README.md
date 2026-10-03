# Facilita Estudo — documentação de engenharia

Planejamento inicial e documentação de desenvolvimento, iniciados em 02/10/2026. Consulte o estado abaixo para distinguir especificação de implementação validada.

## Leitura recomendada

1. [Planejamento mestre completo](PLANEJAMENTO_MESTRE.md).
2. [Decisões e pendências](DECISIONS.md).
3. [Arquitetura](ARCHITECTURE.md), [domínio](DOMAIN_MODEL.md) e [banco](DATABASE_PLAN.md).
4. [API e contratos](API_PLAN.md), [IA](AI_ARCHITECTURE.md), [RAG](RAG_ARCHITECTURE.md) e [segurança](SECURITY.md).
5. [UX](UI_UX.md) e [monetização](MONETIZATION.md).
6. [Entregas, dependências e gates](IMPLEMENTATION_PLAN.md).
7. [Ownership e prompts dos quatro agentes](SUBAGENT_PLAN.md).
8. [Testes e Definition of Done](TEST_STRATEGY.md).
9. [Contrato de desenvolvimento atual](DEVELOPMENT_CONTRACT.md), [ambiente local](LOCAL_DEVELOPMENT.md), [validação](VALIDATION.md) e [operação](OPERATIONS.md).

[Requisitos originais](REQUISITOS_ORIGINAIS.md) preserva o pedido fornecido pelo usuário. O plano mestre reúne os documentos temáticos; ao atualizar um tema, atualizar também sua versão consolidada.

## Estado atual

- Implementação local em `backend/` e `front-end/`, com planejamento e documentação centralizados nesta pasta.
- Fluxos e verificações locais aprovados; condições externas para produção permanecem explícitas.
- [Estado e evidências atuais](DEVELOPMENT_STATUS.md) registram execução e pendências.
- Preços, limites comerciais, fornecedor de IA da plataforma e termos aplicáveis continuam sujeitos às validações registradas.
- Desenvolvimento distribuído entre coordenador e três subagentes autorizados pelo usuário.
- Testes, lint, build e verificações locais executados com autorização. Chamadas cloud reais ainda dependem de credencial e orçamento de teste.

## Convenções

- **FATO VERIFICADO:** documentação oficial consultada em 02/10/2026; revalidar antes da integração.
- **DECISÃO NOSSA:** escolha proposta para o produto, sujeita à revisão registrada.
- **HIPÓTESE:** exige medição ou confirmação.
- **VALIDAÇÃO NECESSÁRIA:** não converter em comportamento presumido.

Instruções do usuário prevalecem: menor escopo, arquivos relacionados, dependências novas mediante confirmação e nenhuma execução de testes/lint/build/comandos demorados sem confirmação.
