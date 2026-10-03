# Cobertura consolidada e limites

## Ambiente e método

Frontend: `http://localhost:3000`. API: `http://localhost:3001`. Dois agentes `gpt-6-luna` com esforço `xhigh` foram utilizados, por solicitação explícita. O coordenador conduziu a sessão docente visível no navegador interno porque o subagente não conseguia controlar aquela sessão. O aluno usou o Chrome visível; o docente também avaliou páginas públicas em sua aba Chrome.

Grupos de abas Chrome compartilham cookies e não constituem isolamento de autenticação. A sessão docente do IAB e a sessão do aluno no Chrome permitiram separar os papéis. O aluno entrou temporariamente na conta docente QA, sob coordenação, para tentar upload e exportação. Esse desvio está registrado, não equivale a um teste de aluno com permissões docentes.

Foram usados dados sintéticos. Chaves foram fornecidas pelo usuário e adicionadas pela interface; valores completos e senhas foram omitidos dos relatórios. Algumas capturas docentes mostram apenas máscara/sufixo. Não foram executadas suítes, lint ou build, nem foram corrigidos arquivos da aplicação. O repositório recebeu alterações externas durante a sessão: os diagnósticos de código descrevem a versão observada, não um commit imutável.

## Inventário de rotas

“Parcial” indica visita e algumas ações, sem certificar todas as possibilidades. As rotas dinâmicas sem artefato não foram abertas com IDs inventados.

| Rota | Resultado da coleta |
|---|---|
| `/` | Visitada; FAQs e comparação de planos interagidas. |
| `/cadastro` | Cadastro QA dos dois papéis concluído. |
| `/entrar` | Login QA dos dois papéis concluído. |
| `/recuperar-senha` | Formulário inspecionado; envio não testado. |
| `/auth/password-reset` | Estado sem token visitado; redefinição não executada. |
| `/pedido-de-exclusao-recebido` | Visita direta; mensagem estática julgada. Nenhuma exclusão. |
| `/app` | Visitado nos dois papéis; inconsistência no painel do aluno. |
| `/app/disciplinas` | Criação docente; lista aluno vazia após matrícula. |
| `/app/disciplinas/[id]` | Disciplina QA criada/editada; tópicos e objetivos; detalhe também acessível ao aluno por URL conhecida. Upload sem persistência comprovada. |
| `/app/turmas` | Convite/matrícula/lista e limite de criação testados parcialmente. |
| `/app/turmas/[id]` | Matrícula e estado privado observados; roteiro salvo com códigos; publicação sem conclusão confirmada. |
| `/app/materiais/[id]` | Não coberta: nenhum ID de material persistido confirmado. |
| `/app/conversas` | Formulário aluno e falha de criação observados; formulário docente visitado ao final, sem conversa criada. |
| `/app/conversas/[id]` | Não coberta: nenhuma conversa criada confirmada. |
| `/app/estudo` | Estado vazio/seletor do aluno inspecionado; criação bloqueada. Docente não concluiu esse percurso. |
| `/app/estudo/[id]` | Não coberta: nenhum estudo gerado. |
| `/app/simulados` | Estado vazio/seletor do aluno inspecionado; geração bloqueada. Docente não concluiu esse percurso. |
| `/app/simulados/[id]` | Não coberta: nenhum simulado gerado. |
| `/app/avaliacoes` | Lista/criação docente parcialmente testadas. Não há entrada equivalente na navegação aluno observada. |
| `/app/avaliacoes/[id]` | Avaliação manual salva e READY; configuração assistida inspecionada; pedidos de PDF tentados sem download confirmado. |
| `/app/exports/[id]` | Não houve detalhe/download final confirmado da exportação da avaliação. |
| `/app/configuracoes/perfil` | Perfis/papéis inspecionados; feedback de alteração persistida não comprovado. |
| `/app/configuracoes/ia` | Chaves salvas, máscara, modelos/consulta de consumo; preferência visual incorreta após recarga. Checks QA terminaram no banco após intervenção. |
| `/app/configuracoes/plano` | Regras, limites e piloto inspecionados; ajustes QA temporários autorizados, depois restaurados. |
| `/app/configuracoes/privacidade` | Exportação pessoal e download; erro/sucesso simultâneos; preview de exclusão cancelado; overflow mobile aluno. |

## Relação entre os bloqueios

```text
Cadastro/login → disciplina → turma → convite → matrícula: concluídos
                                        ├→ lista/painel do aluno: inconsistentes
                                        └→ roteiro: rascunho salvo; publicação incerta

Upload confirmado no app → processamento READY → liberação à turma
        [pendente]                 [não testado]       [não testado]
                                                        ↓
                  tutor com fontes / resumo / cartões / plano / simulado
                                    [não validados]

Avaliação manual → questão salva → READY → job PDF
      concluído       concluído    confirmado   antigos SUCCEEDED no banco
                                                    ↓
                                           download/inspeção PDF
                                               não confirmado
```

## Evidência disponível

- Docente: seis JPEGs persistidos; índices no relatório docente.
- Aluno: observações AX, passos e métricas de layout. Capturas temporárias não foram salvas em disco durante a coleta. Não foram recriadas posteriormente.
- Fixture sintética: PDF de fotossíntese e sua renderização PNG; não prova upload.
- Diagnóstico restrito a QA: estados de jobs/outbox e registro da restauração dos planos; nenhuma leitura de payload de jobs ou segredos publicada.

Conclusão de cobertura: foi uma auditoria parcial com resultados concretos. Não foi concluído o teste de toda a plataforma, nem foi validada a qualidade das gerações de IA. A organização posterior preserva essa limitação.
