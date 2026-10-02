# Facilita Estudo — design.md

Documentação do design das telas do **Facilita Estudo**, uma plataforma acadêmica web para professores e alunos. Serve como referência para implementação e para novas telas.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `00 Design System.dc.html` | Cor, tipografia, espaçamento, botões e estados, campos, seleção, status, processamento, avisos, vazio, diálogo, questão |
| `01 Entrada e Conta.dc.html` | E1–E6: home pública, cadastro, login, recuperação, contexto |
| `02 Compartilhado.dc.html` | C1–C6: home, disciplinas, disciplina, material, conversa com IA |
| `03 Professor.dc.html` | P1–P10: turmas, participantes, liberação, avaliações, geração, editor, revisão, exportação, roteiro |
| `04 Aluno.dc.html` | A1–A9 + A4m.1–A4m.9: home, turma, resumo, flashcards, plano, simulado, resultado, prática |
| `05 Configuracoes.dc.html` | S1–S5: perfil, IA e Ollama Cloud, plano e consumo, privacidade |
| `Sidebar.dc.html` | Navegação lateral desktop (props `role`, `active`, `used`, `limit`, `user`, `email`, `badges`) |
| `TabBar.dc.html` | Barra inferior celular (props `role`, `active`) |
| `Icon.dc.html` | Ícones Lucide (props `icon`, `size`, `stroke`) |

Formatos: desktop 1280×820 (sidebar 248 + conteúdo) · celular 390×844.

## Base visual

Design system **Organic**, ajustado à direção do briefing (cinza quente + bege, acadêmico, sóbrio). Todos os valores vêm dos tokens de `_ds/organic-…/styles.css`.

### Cor

| Papel | Token | Uso |
| --- | --- | --- |
| Fundo do app | `--color-neutral-200` | Chão de todas as telas |
| Superfície | `--color-neutral-100` | Painéis, listas, área de leitura |
| Texto principal | `--color-text` | Corpo e títulos |
| Texto secundário | `--color-neutral-700` | Metadados, legendas (≥ 4.5:1) |
| Borda | `--color-divider` | Linhas de lista, contorno de campos |
| Ação | `--color-accent-700` | Botão primário, links, seleção (texto `--color-neutral-100`) |
| Ação hover / pressionado | `--color-accent-800` / `-900` | Estados do primário |
| Destaque leve | `--color-accent-100/200` | Seleção, IA, processamento, referência |
| Liberado / concluído | `--color-accent-2-100…800` (sálvia) | Tudo que o aluno vê; sucesso |
| Privado | `--color-neutral-300` + `-900` + cadeado | Material, conversa e avaliação privados |
| Atenção / erro | `--color-accent-800` sobre `--color-accent-100`, borda `-300` | Sempre com ícone e texto |

Não usar o `--color-accent` base para texto pequeno: o contraste não chega a AA.

### Tipografia

- **Caprasimo** (`--font-heading`): só no display da home pública (44–54), nos títulos de página (28–32), nos títulos de diálogo e nos números de destaque. Os botões `.btn` também usam essa fonte, porque é o padrão do Organic.
- **Figtree** (`--font-body`) em toda a interface:
  - Título de seção: 700, 17–18
  - Rótulo: 600, 13
  - Corpo: 15/1.55
  - Leitura longa: 17/1.7, medida de até 64ch
  - Legenda: 12
- Trechos de PDF simulados usam serifa (Georgia) para diferenciar o documento da interface.

### Forma e espaço

- Raios: `--radius-sm` 8 (chips) · 16 (linhas) · 20–28 (painéis) · 32–36 (cartões de estudo) · `999px` (botões, campos, tags, seletores segmentados).
- Espaçamento pela escala `--space-*`. A margem do conteúdo é 40 no desktop e 20 no celular.
- Elevação: `--shadow-md` para menus e pré-visualizações, `--shadow-lg` para diálogos, painéis laterais e artboards.
- Alvos de toque no celular com no mínimo 44px; ações principais com 48–52px.
- Conteúdo agrupado em listas dentro de um único painel, evitando cartões soltos.

### Ícones

Lucide com `stroke-width` 2.75, via `Icon.dc.html`.

## Componentes e estados

- **Botões** (`.btn`):
  - Variantes: primário (fundo `accent-700`), secundário, discreto, destrutivo (texto `accent-800`, borda `accent-300`) e ícone.
  - Estados: padrão, hover, pressionado, foco (contorno de 2px na cor `--color-accent`), desativado (45% de opacidade) e carregando (spinner + verbo no gerúndio).
- **Campos** (`.field`, `.input`):
  - Estados: padrão, foco, erro (fundo `accent-100`, ícone e mensagem que diz como corrigir) e desativado.
  - Senha mostra uma checklist de requisitos.
- **Seleção**: `.seg` (opção padrão com `defaultChecked`), `.radio`, checkbox com raio de 7px, toggle (sálvia = liberado) e contador −/+.
- **Visibilidade**: tag "Privado" (cadeado, neutro) e tag "Liberado · turma" (olho, sálvia), presentes em todo material, conversa e avaliação.
- **Status de avaliação**: Rascunho, Em revisão, Finalizada, Falhou, versão `vN`.
- **Processamento**: Enviando % → Lendo página X de Y → Pronto (n páginas indexadas) → Falhou (motivo + Tentar de novo).
- **Referência**: chip numerado "Material · p. N" ou "· slide N". Abre um painel com o trecho destacado e o botão "Abrir na página N".
- **Avisos**: limite atingido, IA indisponível, sucesso e estado vazio (borda tracejada, ícone, título, uma linha de explicação e uma ação).

## Regras de comportamento

1. **Privado vs. liberado**:
   - Todo envio novo entra como privado.
   - A liberação é por turma e pode ser agendada.
   - Material ainda em processamento não pode ser liberado.
2. **Avaliações e gabaritos nunca chegam ao aluno.**
   - Finalizar uma avaliação só bloqueia a edição; não a publica.
   - O que vai para a turma é o roteiro de estudo, que contém apenas tópicos (com páginas) e competências.
3. **Simulado**: respostas e explicações aparecem só depois da entrega. Durante a prova, só é possível marcar questões para revisar.
4. **Geração com IA**:
   - Sempre há estados de andamento (etapas + prévia parcial), conclusão e falha.
   - Na falha, o que já foi gerado fica salvo, nada é descontado e há "Continuar de onde parou".
5. **Limite atingido**:
   - Leitura e edição continuam liberadas.
   - Oferecer "Conectar minha IA" e "Ver planos".
6. **IA indisponível**:
   - A pergunta fica guardada, há botão de tentar novamente e o campo de envio fica desativado.
   - Com Ollama falhando, o app cai para a IA da plataforma e avisa.
7. **Referências**: toda resposta, resumo, explicação e flashcard aponta o material e a página de origem. Sem fonte, a IA diz que não encontrou.
8. **Contexto duplo**:
   - Uma conta pode ter os perfis de professora e de aluna, com dados separados.
   - A troca é feita pelo seletor da sidebar no desktop ou por uma folha inferior no celular.
9. **Ollama Cloud**:
   - Estados: sem chave, verificando, conectada (chave mascarada `olc_••••3f9a`), falhou e confirmação de remoção.
   - A chave nunca é exibida por inteiro.
10. **Privacidade (LGPD)**:
    - A exportação gera um arquivo .zip enviado por e-mail, com link que expira em 7 dias.
    - A exclusão exige digitar "EXCLUIR", tem 30 dias para desistir e lista as consequências antes.

## Flashcards no celular (A4m)

Fluxo: frente → virar → avaliar → próximo.

- **Frente**: pilha de cartões, etiqueta de origem (revisão/novo), link para a página, botões Dica e Escrever resposta.
- **Dica progressiva**: até 3 dicas. Usar dica reduz o intervalo até a próxima revisão.
- **Resposta digitada**: a IA confere item a item e sugere a nota; quem decide é o aluno.
- **Verso**: Errei 1 min · Difícil 10 min · Bom 2 dias · Fácil 5 dias, mais "Ver na p. N" e "Explicar melhor".
- **Gestos**:
  - Esquerda = Errei, direita = Bom, para cima = Difícil, para baixo = Fácil.
  - Todo gesto tem um botão equivalente.
  - Botão de desfazer no topo.
- **Explicar melhor**: folha inferior com a explicação da IA, o trecho da página e perguntas de continuação.
- **Ações do cartão** (toque longo ou ⋯): editar, ver origem, marcar como difícil, adiar, suspender, avisar que a resposta está errada.
- **Sessão concluída**: distribuição das notas, assuntos para reforçar, próxima revisão e atalhos.
- **Outros estados**: tudo em dia (adiantar ou modo livre), baralho sendo gerado (já dá para começar pelos prontos), sem conexão (cartões do dia guardados no aparelho).

## Planos (genéricos)

| Plano | Gerações de IA por mês | Armazenamento | Alunos / turmas |
| --- | --- | --- | --- |
| Gratuito | 20 | 1 GB | 1 turma |
| Essencial | 100 | 5 GB | 150 alunos |
| Profissional | 500 | 20 GB | Ilimitado |

Com a IA própria (Ollama Cloud), as gerações não consomem o plano.

## Conteúdo de exemplo

Mistura de ensino superior e ensino médio:

- **Disciplinas**: Bioquímica Metabólica, Biologia — 3º ano, Cálculo I, Redação ENEM.
- **Pessoas**: Profa. Marina Couto (também tem perfil de aluna) e o aluno Lucas Andrade.

## Pendências

- Mapa de fluxos de navegação.
- Protótipo navegável dos fluxos de professor e aluno.
- Tela dedicada de criação de resumo.
- Versões para celular das telas que ainda só existem em desktop.
- Handoff para Figma com medidas e assets.
