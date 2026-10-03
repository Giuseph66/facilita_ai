# Desenvolvimento local — Facilita Estudo

Plataforma acadêmica web. Frontend em `front-end/`; API, worker, migrations e infraestrutura em `backend/`. Design de referência em `design/`; documentação em `docs/`.

## Desenvolvimento local

Requisitos: Node.js 22.12+ (desenvolvimento inicial em Node 24), pnpm 10.17, Docker com Compose.

```bash
pnpm install
pnpm setup:local
pnpm infra:up
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1
- Email local (Mailpit): http://localhost:8025
- PostgreSQL/Redis: publicados somente em loopback.

`setup:local` gera segredos aleatórios em arquivos ignorados pelo Git e preserva configurações existentes. Nunca commitar `.env`. O vault exige chave base64 de 32 bytes. Banco runtime separado do migrator.

API e worker são processos distintos da mesma aplicação modular. `pnpm dev` inicia ambos e a web. Originais ficam no storage privado. Workers precisam Redis/PostgreSQL.

Para exportar PDF executando o worker diretamente no host, instale Chromium e configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` no `backend/.env` (neste ambiente: `/usr/bin/chromium`). A imagem Docker já fornece o navegador e esse caminho; a política de sandbox do host deve ser validada conforme [OPERATIONS.md](OPERATIONS.md).

## Inteligência artificial

BYOK Ollama Cloud configurado dentro da aplicação; chave criptografada, uso individual. Não exige Ollama local. IA da plataforma permanece desativada até validação do fornecedor/contrato.

`AI_PROVIDER=fake` somente em development/test explícito, para testes determinísticos; não é provedor real nem permitido em produção. Uso normal exige conexão cloud válida. Embeddings CPU exigem download controlado dos pesos e não se confundem com geração cloud.

Para instalar os pesos locais, execute `pnpm model:install` com autorização para o download. O instalador resolve uma revisão imutável, baixa apenas tokenizer/config e ONNX q8, registra checksums e fixa `EMBEDDING_MODEL_REVISION` no `.env` existente. Para escolher uma revisão específica: `pnpm model:install <commit-SHA-completo>`. O worker usa arquivos locais e rejeita manifest incompatível; ao trocar fingerprint, reprocessar os documentos. O arquivo q8 tem aproximadamente 118 MB, além do tokenizer/config, conforme o [repositório oficial do modelo](https://huggingface.co/Xenova/multilingual-e5-small/tree/main/onnx).

## Validação

Conforme instrução do usuário, executar somente com autorização:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Cada comando verifica seu escopo; sucesso de compilação não comprova toda jornada. Estado real da entrega e limitações em [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

## Segurança

Sessões HttpOnly e CSRF, papéis por contexto, PostgreSQL RLS, quotas transacionais, originais privados e provas/gabaritos sempre privados. BYOK não desliga quotas e não existe fallback pago automático.

Não usar configurações locais como produção. Produção requer HTTPS, secrets, revisão de termos/LGPD, backups restauráveis e gates de [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Documentação

[Índice](README.md) · [Contrato atual de desenvolvimento](DEVELOPMENT_CONTRACT.md) · [Arquitetura](ARCHITECTURE.md) · [Plano mestre](PLANEJAMENTO_MESTRE.md).
