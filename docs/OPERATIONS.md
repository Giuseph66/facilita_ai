# Operação e recuperação

Este runbook descreve a implantação. Build, execução e restore precisam ser validados antes de release; a presença deste arquivo não demonstra aprovação dos gates.

## Desenvolvimento

1. Instalar as dependências declaradas com pnpm e gerar a configuração local por `pnpm setup:local`.
2. Subir os serviços por `pnpm infra:up` e aplicar o schema por `pnpm db:migrate`.
3. Iniciar API, worker e interface com `pnpm dev`.

PostgreSQL, Redis, SMTP de teste e API ficam locais. O navegador usa o proxy de mesma origem do Next. Nenhuma credencial Ollama vai para JavaScript, logs ou arquivo de cliente.

## Implantação

Os Dockerfiles ficam nas pastas respectivas, com contexto de build na raiz. Exigem `pnpm-lock.yaml` gerado e revisado. A aplicação web deve acessar a API pela rede interna; publicar somente a entrada HTTPS da interface e endpoints necessários de operação por acesso controlado. Configure `API_INTERNAL_URL` no build do frontend para o hostname privado da API.

API e worker usam a mesma imagem backend, mas processos separados. API: `node dist/main.js`; worker: `node dist/worker.js`. Executar migrations com credencial distinta antes da troca de versão. O runtime deve ser `NOSUPERUSER NOBYPASSRLS`. Não fornecer `DATABASE_MIGRATION_URL` ao processo normal em produção.

### Worker com Chromium

O worker gera PDFs de avaliações com Chromium. Mantenha-o como usuário não-root (`USER node` na imagem), com o sandbox do Chromium habilitado. No serviço `worker` do Compose, use:

```yaml
command: ["node", "dist/worker.js"]
init: true
shm_size: 1gb
security_opt:
  - "seccomp=./backend/chromium-seccomp.json"
```

Execute `docker compose` a partir da raiz do repositório para que o caminho do perfil seja resolvido corretamente. O perfil `backend/chromium-seccomp.json` é uma cópia do perfil publicado pelo Playwright na tag `v1.63.0`, correspondente à versão instalada em `backend/package.json`: [fonte oficial](https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/utils/docker/seccomp_profile.json). SHA-256 do arquivo: `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.

O perfil mantém a política padrão do Docker e libera `clone`, `setns` e `unshare` para namespaces de usuário, como documenta o [guia oficial de Docker do Playwright](https://playwright.dev/docs/docker). Não execute o worker com `privileged`, não adicione `SYS_ADMIN` e não passe `--no-sandbox`; se o host não permitir o sandbox, corrija a política do host em vez de remover o isolamento do navegador.

Teste em 02/10/2026: Chromium nativo gerou PDF; o container com esse perfil e chromium-sandbox retornou EACCES em credentials.cc. O perfil sozinho não garante compatibilidade com namespaces/AppArmor do host. Essa etapa de implantação não está aprovada. A política global da máquina foi preservada. A imagem inclui pg_dump/pg_restore17 e o embedding real CPU foi executado offline com o cache montado somente para leitura.

A role migrator precisa de `SUPERUSER` ou `BYPASSRLS`: ela é proprietária das funções `SECURITY DEFINER` que invalidam dependências de uma fonte e corrigem tentativas de forma atômica. As funções conferem o ator e o recurso antes de acessar outros registros, usam `search_path` fixo e não concedem execução a `PUBLIC`. As tabelas de conteúdo mantêm `FORCE ROW LEVEL SECURITY`; a role runtime recebe apenas execução das funções explícitas, sem atualização direta de tentativas.

Persistir PostgreSQL, Redis, `/data/storage` e `/data/models` em volumes. Definir `APP_ORIGIN` como URL HTTPS exata. Configurar vault com chave aleatória de 32 bytes e versão explícita. Guardar as chaves anteriores até migração das credenciais existentes. Não usar os valores de exemplo.

`AI_PROVIDER=ollama` e `EMBEDDING_PROVIDER=cpu` são caminhos reais. Providers fake pertencem exclusivamente aos testes/desenvolvimento explícito. A IA paga pela plataforma permanece desativada até decisões de fornecedor, comercial e privacidade. SMTP deve ser real para recuperação de senha. Pin do modelo de embedding deve ser definido e reindexação executada antes de trocar fingerprint.

## Backup

`node scripts/backup.mjs`, executado a partir de `backend/`, produz dump PostgreSQL e arquivo de storage em `.local/backups/`, identificados pelo mesmo timestamp. Necessita `pg_dump` compatível e `tar`. Guardar cópias cifradas fora da máquina. As chaves de vault precisam de backup separado, protegido e com acesso mínimo; o dump sozinho não permite recuperar as credenciais.

Para consistência entre arquivo e banco, interromper novas gravações e concluir/parar workers durante o snapshot, ou usar snapshots coordenados dos volumes. Não excluir arquivos enquanto o snapshot estiver em andamento.

## Ensaio de restore

1. Criar PostgreSQL isolado, com extensão vector compatível, e restaurar o dump com `pg_restore`.
2. Restaurar storage e chaves de vault na mesma versão; aplicar migrations posteriores usando migrator.
3. Conferir flags da role runtime e conceder apenas permissões necessárias.
4. Inicializar Redis vazio e reiniciar o worker. Conferir recuperação de jobs/outbox antes de retomar tráfego.
5. Com runtime, verificar login, dois usuários isolados, download autorizado, documento indexado, job recuperado e exportação.

Não ensaiar restore sobre o banco ativo. Registrar resultado e tempo real de recuperação; não prometer RPO/RTO antes do ensaio.

## Incidente e rollback

Retirar a versão defeituosa do tráfego, pausar novos jobs e guardar metadados seguros do incidente. Não copiar material acadêmico, chaves ou prompts privados para logs. Reimplantar a imagem anterior somente se compatível com as migrations aplicadas; migrations são progressivas, com checksum. Mudança destrutiva exige backup e estratégia de rollback específicos. Revogar sessões/credenciais comprometidas e verificar jobs pendentes antes de reabrir o serviço.
