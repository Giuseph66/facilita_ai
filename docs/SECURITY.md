# Segurança e privacidade

Requisito estrutural desde fundação, não etapa final isolada. Documento é proposta de engenharia, não parecer/certificação jurídica.

## Autenticação

1. Validar cadastro/email/senha/persona.
2. Hash Argon2id; medir parâmetros no hardware.
3. Criar conta/workspace/papel contextual em transação.
4. Token aleatório de alta entropia; banco guarda hash.
5. Cookie de sessão opaca.
6. Rotação no login, revogação no logout.
7. Recovery com resposta genérica; token único/expirável.
8. Reset consome token e revoga sessões existentes.

Produção: __Host-fe_session, HttpOnly, Secure, SameSite=Lax, Path=/, sem Domain. TTL ocioso/absoluto configuráveis. HTTP local usa configuração distinta explícita. Nenhum token de sessão em localStorage.

CSRF sincronizado à sessão + Origin validado em mutações; SameSite não é defesa única. CORS same-origin via proxy, ou allowlist exata com credentials; nunca wildcard. Rate limiting em login, recovery, invites, uploads e IA.

FATO VERIFICADO: OWASP recomenda Argon2id. [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Autorização

RBAC contextual + ABAC de owner/matrícula/classificação/release. Persona não concede papel; entitlement não concede permissão pedagógica.

| Recurso | Autor/proprietário | Aluno elegível | Outro usuário |
|---|---|---|---|
| Material privado | Sim | Só se proprietário | Não |
| Material liberado à turma | Sim | Sim | Não |
| TEACHER_SECRET | Professor autor | Não | Não |
| Avaliação/questão/gabarito | Professor autor | Não | Não |
| Prompt docente | Autor, conforme interface | Não | Não |
| Blueprint publicado | Professor | Mesma revisão pública | Não |
| Conversa pessoal | Proprietário | Proprietário | Não |
| Export avaliação | Solicitante autorizado | Não | Não |
| API key | Uso interno do titular | Uso interno do titular | Não |

Owner de workspace/admin futuro não recebe acesso implícito a provas ou material privado de terceiros. Resource privado proibido/desconhecido usa 404. Worker/jobs/downloads/histórico têm mesma política do recurso original.

## Banco/RLS

- Runtime API/worker sem superuser/BYPASSRLS/ownership das tabelas.
- Migrator separado.
- Contexto user/workspace com SET LOCAL por transação.
- Sem contexto válido: negar.
- Policies para documentos/páginas/chunks/vetores e provas/respostas.
- FK composta impede relação cross-tenant.
- Worker revalida antes de executar e publicar.
- Dispatcher tem permissão técnica mínima, não acesso irrestrito ao corpus.
- SQL parametrizado; validação de identificadores dinâmicos.

FATO VERIFICADO: superusers/BYPASSRLS e normalmente owners contornam RLS. Testes devem usar usuário runtime real, não migrator. [PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Avaliações privadas

- Tabelas/DTOs separados.
- Sem indexação no corpus estudantil.
- Study não importa repository de Assessment.
- Prompts/gabaritos não entram em logs.
- Conversa docente não alimenta tutor do aluno.
- PUBLISHED não significa acesso público.
- Derivados permanecem privados.
- Export privado com TTL e reautorização; nunca pasta pública.
- Material TEACHER_SECRET não pode ser liberado por endpoint genérico.

Garantia: isolamento de dados/fluxos. Não prometer impossibilidade de modelo gerar independentemente pergunta semelhante sobre mesmo assunto.

## StudyBlueprint

Fonte permitida: tópicos/objetivos já públicos do curso. Permitido: tópicos amplos, competências controladas, dificuldade ampla e orientação pública. Proibido: enunciados/paráfrases, alternativas, respostas, ordem, pesos, distribuição real, páginas que revelem questão, prompts e IDs privados.

Seleção/revisão/publicação explícitas, auditadas. Todos os elegíveis recebem mesma revisão. Sem IA sanitizando prova como garantia.

## Vault

AES-256-GCM, nonce aleatório, AAD com connection/user/provider, master key fora do banco/Git, key_version para rotação. Full key só dentro do adapter. API retorna máscara/status. Logs/body/tracing não capturam segredo. Revogar/remover impede novos jobs; pending jobs revalidam credential_revision. Apagar ciphertext imediatamente; auditoria guarda só evento.

Health check distingue conectividade/auth/capacidade e indica possível consumo pago. URL do provider controlada; sem SSRF por endpoint enviado pelo usuário. BYOK permanece isolado por usuário do aplicativo: ele pode cadastrar chaves de contas Ollama diferentes e definir sua ordem de uso; nenhuma geração usa conexões de outro usuário do aplicativo.

## Upload/processamento/export

- Magic bytes/MIME/estrutura, não só extensão.
- Limite arquivo/páginas/tempo/memória/descompactação.
- Nome original só metadado; storage key server-side.
- Path traversal e symlinks bloqueados.
- XML sem entidades externas; ZIP bomb limitado.
- Parser isolado; não executar macros/objetos.
- Sem import de URL no MVP.
- Storage fora do webroot; download autorizado.
- Renderer recebe HTML controlado, sem rede.
- Antivírus planejado como evolução.

## Prompt injection/RAG poisoning/XSS

Material é dado não confiável. Fontes delimitadas; instruções recuperadas não modificam autorização. Modelo não recebe secrets nem ferramentas administrativas. SQL autorizado antes do contexto. IDs de citação validados. Markdown sanitizado e HTML arbitrário desabilitado. Não confiar em "ignore instruções maliciosas" como único controle.

Teste adversarial tenta revelar prova/key por documento, pergunta, fonte, job, download e histórico. Capturar contexto do fake provider, não só resposta final.

## Privacidade/LGPD

Conceitos: finalidade, minimização, bases legais, consentimento quando aplicável, exportação, exclusão, retenção e auditoria. Não usar consentimento genérico para tudo.

VALIDAÇÃO NECESSÁRIA antes da produção:

- Público/idade, dados de menores.
- Bases legais por finalidade.
- Papel da plataforma/instituição no tratamento.
- Transferência internacional/contratos com fornecedores.
- Direitos sobre materiais enviados.
- Retenção de original, histórico, audit e backup.
- Resposta a incidentes e pedidos de titulares.

Referência: [LGPD oficial](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

FATO VERIFICADO em 02/10/2026: termos Ollama exigem 18 anos. VALIDACÃO NECESSÁRIA para uso cloud/custódia de chaves no modelo SaaS; documentação API não resolve autorização contratual. [Termos](https://ollama.com/terms).

## Exclusão/revogação

Bloquear acesso imediatamente, purge assíncrono de originais/textos/chunks/vetores/exports conforme política. Invalidate mensagens/summaries/artifacts dependentes. Reautorizar jobs em andamento antes de publicar. Não é possível retirar conhecimento já visto pelo usuário; controlar futuros acessos.

Backups com prazo e reaplicação de exclusões após restore. Rotação de chave mestre precisa preservar descriptografia de dados autorizados; perda da chave é risco operacional. Audit sem segredo ou conteúdo bruto.

## Auditoria/observabilidade

Registrar login/revogação, key conectada/rotacionada/removida, material liberado/revogado, matrícula alterada, blueprint publicado, avaliação finalizada/exportada e privacy request. requestId/jobId/correlationId; redaction e retenção. Health público mínimo; metrics restritas. Sem console.log aleatório de objetos.
