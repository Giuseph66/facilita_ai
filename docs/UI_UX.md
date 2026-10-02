# UI/UX e design system

## Direção

Web responsiva, acadêmica, elegante, neutra, confortável para leitura prolongada. Predomínio cinza quente/bege, acento terroso discreto. Não parecer escola infantil, dashboard financeiro ou template SaaS genérico. PWA posterior, sem apps nativos iniciais.

## Paleta proposta

| Token | Claro | Escuro proposto | Uso |
|---|---|---|---|
| background | #F5F1E8 | #211F1C | Fundo |
| surface | #FFFFFF | #2B2824 | Conteúdo |
| surface-muted | #EDE7DC | #36312B | Áreas secundárias |
| border | #D8CFC0 | #51483D | Separação decorativa |
| border-strong | #8A8074 | #9A8D7D | Inputs/controles |
| text-primary | #292524 | #EEE8DC | Texto principal |
| text-secondary | #625A52 | #BDB3A5 | Auxiliar |
| accent | #805039 | #D4AD8E | Ação principal |
| accent-foreground | #FFFFFF | #211F1C | Texto sobre ação |
| success | #3F654B | #9EC3A6 | Sucesso |
| warning | #805B13 | #E3C078 | Aviso |
| danger | #9B3632 | #E8A19B | Erro |

Contraste calculado no planejamento:

| Par | Razão |
|---|---|
| text-primary/background claro | 13,46:1 |
| text-secondary/background claro | 6,00:1 |
| Branco/accent claro | 6,72:1 |
| border-strong/surface branca | 3,87:1 |
| text-primary/background escuro | 13,47:1 |
| text-secondary/background escuro | 7,95:1 |
| Texto escuro/accent escuro | 7,96:1 |

Borda decorativa não substitui contorno acessível. Validar cada combinação/estado real, inclusive semânticas, disabled, hover e focus.

Meta: WCAG 2.2 AA; texto normal ≥4,5:1, componentes essenciais ≥3:1. [WCAG](https://www.w3.org/WAI/WCAG22/quickref/).

## Sistema visual

- Sans legível, fallback local; seleção final em E04.
- Largura limitada para texto acadêmico.
- Espaçamento em múltiplos de 4 px.
- Bordas moderadas, sombras discretas.
- Hierarquia baseada em texto/conteúdo, não excesso de cards.
- Ícones com label acessível; status não depende só de cor.
- Focus visível, teclado, redução de movimento.
- Reordenação com alternativa por botões; drag não obrigatório.
- Label/ajuda/erro associados ao campo.
- Formulas preservadas e renderizadas com sanitização adequada.

## Home e contexto

Home pública simples: proposta de valor, professor/aluno, acesso e planos. Sem dashboard carregado.

Professor: disciplinas, turmas, materiais, avaliações recentes, trabalhos e ações rápidas.

Aluno: continuar estudo, materiais recentes, disciplinas, simulados e revisões.

Contexto/persona sempre visível. Mudança de UI não concede permissão; backend decide. Mesma pessoa pode alternar experiências em contextos diferentes.

## Rotas previstas

```text
/
/entrar
/cadastro
/recuperar-senha
/app
/app/disciplinas
/app/disciplinas/[id]
/app/turmas/[id]
/app/materiais/[id]
/app/conversas/[id]
/app/avaliacoes/[id]
/app/simulados/[id]
/app/configuracoes/ia
/app/configuracoes/plano
/app/configuracoes/privacidade
```

## Fluxos

### Conta

Cadastro → persona inicial → workspace pessoal → home contextual. Login/logout/reset com erros seguros. Sem role institucional/admin no cadastro.

### Materiais

Disciplina/turma → adicionar material → arquivo → progresso por etapa → READY → estudar. Original acessível ao autorizado. Falha mantém arquivo e oferece reprocessamento. Indicar sem texto/OCR necessário; não inventar extração.

Estado privado/liberado explícito. Material secreto não tem ação de compartilhar. Liberação exige escolha da turma e confirmação de finalidade.

### IA/BYOK

Configurações → IA → Ollama Cloud → key write-only → salvar → máscara/status → verificar → escolher modelo. Indicar chamada eventualmente paga. Nunca mostrar key integral após salvar, armazenar em localStorage ou retornar em DTO.

### Avaliação

Disciplina → materiais/configurações → job → DRAFT → editar/adicionar/excluir/reordenar → revisar → READY → finalizar PUBLISHED privado → exportar prova/gabarito separados. Copiar para alterar versão final. Não sugerir publicação para alunos como comportamento existente.

### Estudo

Escolher materiais/contexto → perguntar ou criar artefato → fontes → continuar conversa. Simulado sem gabarito antecipado → submissão → erros por tópico → revisão/plano/flashcards/exercícios semelhantes.

### Blueprint

Professor seleciona tópicos já publicáveis → revisão → publicação auditada. Alunos elegíveis leem a mesma versão. Não mostrar detalhes de avaliação privada.

## Estados obrigatórios

Vazio orienta próxima ação. Loading/failure/success consistentes. Job mostra estágio real, não percentual fictício. Quota explica limite e período. Provider indisponível oferece retry apropriado, sem troca invisível de pagador. Fonte revogada fica indisponível e bloqueia resultado dependente conforme política.

## Acessibilidade/responsividade

Aceite em 360 px e desktop; forms, chat, editor e reordenação por teclado; leitura sem overflow horizontal injustificado; zoom/reflow; foco/erros/labels corretos. Não implementar dashboard administrativo institucional agora.

## PWA/mode escuro

E31, após release. Manifest e shell instalável; sem conteúdo acadêmico sensível offline no início. Logout/updates/contraste testados. Não cachear provas, chaves ou respostas privadas indevidamente.
