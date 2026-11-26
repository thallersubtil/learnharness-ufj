# Chat com o SIGAA à mão: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em qualquer chat a IA conhece as matérias, provas, tarefas, notícias e arquivos do SIGAA (resumo no prompt + ferramenta `ufj`); a aba de materiais abre o arquivo dentro do app e puxa um chat focado nele; a Preparação ganha "Revisar para a prova"; as telas da UFJ ficam enxutas.

**Architecture:** A sincronização passa a ler Tarefas e Notícias (novos leitores sobre a mesma navegação). Um texto de resumo é montado por função pura do core a partir das turmas e entra no system prompt por uma opção nova do construtor de agentes (`contextoExtra`), preenchida pelo servidor a cada turno. Uma ferramenta de leitura `ufj` (agente) consulta a biblioteca por closures injetadas pelo servidor. O vínculo `ufj-context` ganha `origem` e `arquivo`, com avaliação opcional. Uma rota serve o arquivo da turma `inline`; uma página o mostra. O resumo entra no FIM do system prompt (depois de todos os fragmentos), e não logo após `12-contexto-ufj.md` como o spec sugere: o compositor trata os fragmentos como arquivos fixos e o resumo muda a cada turno; o fragmento ganha o parágrafo que aponta para o bloco.

**Tech Stack:** TypeScript, Next.js 16, Electron, TypeBox, `node:test` via `tsx`, `linkedom`, `pdfjs-dist` (só se o `iframe` de PDF falhar no app).

**Spec:** `docs/superpowers/specs/2026-11-25-ufj-chat-com-sigaa-design.md` (e, por trás, `2026-11-24-ufj-sigaa-design.md`).

## Global Constraints

- Todo texto novo em português do Brasil (telas, prompts, erros, descrições de ferramenta).
- Repositório público: páginas de exemplo e testes só com dados inventados; as páginas reais de Tarefas/Notícias em `~/Library/Application Support/LearnHarness UFJ/diagnostico-sigaa/2026-11-24-teste/` servem de modelo de estrutura e nunca entram no repositório. Conferir o diff contra nomes reais antes de cada commit.
- Zonas de import: `src/core/` não importa agent/server/store; `src/agent/` não importa store (recebe closures); `components/` só `@/src/core`; rotas só exportam métodos HTTP; `params` é Promise.
- Nunca abrir seções proibidas do SIGAA (lista em `SECOES_PROIBIDAS`). Nenhum teste acessa a rede; o SIGAA falso é `tests/helpers/sigaa-falso.ts`.
- Formato da biblioteca continua `1`; campos novos são opcionais.
- Rodar um arquivo de teste: `NODE_ENV=test npx tsx --test tests/<arquivo>`. Antes do `tsc`, apagar `tsconfig.tsbuildinfo`.
- A rota que serve arquivos só serve nomes aceitos por `isValidNomeArquivo` dentro da pasta `referencias` da turma; nunca um caminho vindo do pedido.

## Review Focus

1. **Matéria com duas turmas (plano importado + SIGAA):** o resumo e `ufj materias` mostram a do SIGAA; a outra só em `materias`, marcada "(plano importado)". Teste na Tarefa 4.
2. **Biblioteca vazia ou sem conta:** nenhum resumo entra no prompt, e `ufj materias` responde "Nenhuma matéria sincronizada ainda." sem lançar. Testes nas Tarefas 4 e 5.
3. **Nome de arquivo malicioso na rota** (`../`, nome com barra, nome inexistente): 400/404, nunca leitura fora da pasta. Teste na Tarefa 8.
4. **Chat de material ou de revisão não vira "aula feita"** do tópico; chat de tópico continua contando. Teste na Tarefa 7.
5. **Notícia já lida não é relida; notícia nova tem o texto lido uma vez;** a sincronização não cresce com o semestre. Teste na Tarefa 3.

---

### Task 1: Campos de tarefas e notícias na turma

**Files:**
- Modify: `src/core/biblioteca.ts` (tipos e `parseTurma`)
- Test: `tests/sigaa-tarefas-tipos.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Tarefa { titulo: string; inicio?: string; fim?: string; hora?: string; instrucoes: string; temArquivo: boolean }  // datas AAAA-MM-DD, hora HH:MM
  export interface Noticia { sigaaId: string; titulo: string; data: string; texto?: string }
  // em Turma:
  tarefas?: Tarefa[];
  noticias?: Noticia[];
  ```
  Validação com as mesmas mensagens em português dos outros campos (`optData`, `HORA_RE`, `str`).

- [ ] **Step 1: Write the failing tests** — `it("ida e volta preserva tarefas e notícias")` (deepEqual com uma tarefa completa e uma notícia com `texto`); `it("turma sem os campos continua igual")`; `it("data de tarefa fora do formato dá erro")` (`/AAAA-MM-DD/`).
- [ ] **Step 2: Run** o teste — Expected: FAIL (campos descartados).
- [ ] **Step 3: Implement** tipos e parse.
- [ ] **Step 4: Run** o teste novo e `tests/sigaa-tipos.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): tarefas e notícias na turma`

### Task 2: Leitores de Tarefas, Notícias e do texto de uma notícia

**Files:**
- Create: `src/server/sigaa/ler-tarefas.ts`, `src/server/sigaa/ler-noticias.ts`
- Create: `tests/fixtures/sigaa/turma-tarefas.html`, `turma-tarefas-vazia.html`, `turma-noticias.html`, `turma-noticia.html`
- Test: `tests/sigaa-leitores.test.ts` (acrescentar)

**Interfaces:**
- Produces:
  ```ts
  export function lerTarefas(html: string): Tarefa[]
  export interface NoticiaNaLista { sigaaId: string; titulo: string; data: string; link: LinkJsf }
  export function lerNoticias(html: string): NoticiaNaLista[]
  export function lerTextoDaNoticia(html: string): string   // texto da notícia aberta, sem "Cadastrado por"
  ```
- Estrutura real (modelo para as páginas inventadas): Tarefas é `table.listing` com linhas em pares; a 1ª tem `td.first` em negrito (título), o período em texto "de dd/mm/aaaa às HHhMM a dd/mm/aaaa às HHhMM" (`td` com `rowspan`), "Sim"/"Não" (nota), envios e o comando "Enviar tarefa"; a 2ª linha traz as instruções e, às vezes, "Baixar arquivo". Notícias: linhas com `td.first` (título), `td.width75` (data dd/mm/aaaa) e o comando "Visualizar" com `id`. Seção vazia: "Nenhum item foi encontrado" → `[]`.

- [ ] **Step 1: Write the failing tests** — `it("tarefas: título, período, instruções e anexo")` com 2 tarefas (uma com "Baixar arquivo", `temArquivo: true`; `hora` = hora do fim "23:59"); `it("tarefas vazia vira []")`; `it("notícias: id, título, data e comando")`; `it("texto da notícia sem o rodapé 'Cadastrado por'")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** os leitores (reaproveitar `limpo`, `dataBr`, `linkJsf`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): leitores de tarefas e notícias`

### Task 3: Sincronização lê tarefas e notícias (texto só das novas)

**Files:**
- Modify: `src/server/sigaa/navegar.ts`, `src/core/sigaa.ts` (`SigaaTurmaLida`, `montarDoSigaa`, `progressoDaLeitura`), `src/server/sigaa/sincronizar.ts`
- Modify: `tests/helpers/sigaa-falso.ts` (seções Tarefas, Notícias e a página de uma notícia por `id`; registrar quais notícias foram abertas)
- Test: `tests/sigaa-navegar.test.ts`, `tests/sigaa-montar.test.ts`, `tests/sigaa-sincronizar.test.ts` (acrescentar)

**Interfaces:**
- `SECOES_LIDAS = ["Avaliações", "Arquivos", "Tarefas", "Notícias"]`.
- `SigaaTurmaLida` ganha `tarefas: Tarefa[]` e `noticias: Noticia[]` (texto preenchido só nas novas).
- `OpcoesLeitura.noticiaConhecida: (lida: Pick<SigaaTurmaLida,"codigo"|"semestre"|"sufixo">, sigaaId: string) => boolean`.
- `ProgressoLeitura.etapa` ganha `"tarefas" | "noticias"`; textos `"{nome}: lendo tarefas (turma i de n)"` e `"{nome}: lendo notícias (turma i de n)"`.
- `montarDoSigaa`: `turma.tarefas = lida.tarefas`; `turma.noticias` = as do SIGAA, com `texto` vindo da leitura ou, se ausente, do que a turma anterior já tinha para o mesmo `sigaaId`.

- [ ] **Step 1: Write the failing tests** — navegar: `it("lê tarefas e notícias, abrindo o texto só das notícias desconhecidas")` (o falso registra 2 aberturas na 1ª sincronização com `noticiaConhecida` false; com `noticiaConhecida` true para uma delas, só 1); `it("progresso passa por tarefas e notícias")`. montar: `it("notícia já lida mantém o texto; tarefas são substituídas")`. sincronizar: `it("a segunda sincronização não abre notícia nenhuma")` (Review Focus 5).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os três arquivos — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): sincronização traz tarefas e notícias`

### Task 4: O resumo do semestre (puro) e a montagem dos textos da ferramenta

**Files:**
- Create: `src/core/resumo-ufj.ts` (exportar no barril)
- Test: `tests/ufj-resumo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TurmaDaMateria { materia: Materia; turma: Turma }
  /** A turma que a IA vê por matéria: a do SIGAA, senão a mais recente. */
  export function turmasVisiveis(entradas: TurmaDaMateria[]): { visiveis: TurmaDaMateria[]; outras: TurmaDaMateria[] }
  /** Texto exato do spec §5.2; "" quando não há turmas. */
  export function composeResumoUfj(entradas: TurmaDaMateria[], hoje: Date): string
  export function textoMaterias(entradas: TurmaDaMateria[]): string
  export function textoMateria(e: TurmaDaMateria, refs: Referencias, caminho: (arquivo: string) => string): string
  export function textoNoticia(e: TurmaDaMateria, sigaaId: string): string | null
  ```
- Regras do resumo: cabeçalho `[Semestre UFJ — dd/mm/aaaa]`; `Matérias:` código, nome, semestre, separadas por "; "; `Próximas provas:` e `Próximas tarefas:` nos próximos 21 dias (inclui hoje), ordenadas por data, cada uma `dd/mm[ HH:MM] Nome da matéria — nome (em N dias|hoje)`; sem nenhuma no prazo, a próxima futura de cada matéria; linhas vazias são omitidas; no máximo 12 linhas no total; última linha fixa: ``Para tópicos, arquivos do professor, instruções de tarefas e avisos, use a ferramenta `ufj`. Leia os arquivos pelo caminho que ela devolve.``.
- `textoMaterias`: uma linha por turma visível `ICE0001 Cálculo Teste (2026-2, Prof. X): provas: 2ª unidade 03/12 (do SIGAA); 3ª unidade 20/09 (do SIGAA)`; as outras turmas ao fim, com "(plano importado)". Vazio → `Nenhuma matéria sincronizada ainda.`
- `textoMateria`: blocos `Tópicos:` (`id — título — aulas dd/mm`), `Provas:` (nome, data, origem, `escopo: ids`), `Tarefas:` (título, prazo, instruções em uma linha, "com arquivo"), `Notícias:` (`sigaaId dd/mm título`), `Arquivos:` (`título — caminho — tópico de aula`).

- [ ] **Step 1: Write the failing tests** — texto exato do resumo para duas turmas (igual ao exemplo do spec, com datas relativas a `hoje = 25/11/2026`); `it("sem turmas, resumo vazio e textoMaterias avisa")` (Review Focus 2); `it("turma de plano e turma do SIGAA: a do SIGAA aparece; a outra só em materias com a marca")` (Review Focus 1); `it("corta em 12 linhas")`; `it("textoMateria lista arquivos com caminho e notícia devolve o texto")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ufj): resumo do semestre e textos da ferramenta`

### Task 5: Resumo no prompt de todo chat e da conversa lateral

**Files:**
- Modify: `src/agent/teacher-agent.ts` (`AgentBuildOptions.contextoExtra?: string`, anexado após o prompt composto: `${composedPrompt}\n\n---\n\n${contextoExtra}`), `src/agent/side-chat.ts` (`composeSideChatInstructions(switches, extra?: string)` anexa do mesmo jeito), `src/server/chat-handler.ts` e `src/server/side-chat.ts` (passam `resumoUfj()`)
- Create: `src/server/ufj-resumo.ts` — `export function resumoUfj(hoje = new Date()): string` (lê `stores.bibliotecaStore.listMaterias()` + `listTurmas`, monta `TurmaDaMateria[]`, chama `composeResumoUfj`; erro de leitura → "")
- Modify: `src/agent/prompts/shared/12-contexto-ufj.md` (parágrafo novo, texto exato abaixo)
- Test: `tests/ufj-resumo-prompt.test.ts`; atualizar `tests/ufj-prompts.test.ts` se fixar o texto do fragmento; o hash em `tests/extraction.test.ts` muda se o fragmento entrar na composição fixada

Parágrafo novo em `12-contexto-ufj.md`:
```
Todo chat começa com um bloco "[Semestre UFJ]" com as matérias, as próximas provas e tarefas do aluno. Quando ele citar uma matéria, uma prova, uma tarefa ou "o material", consulte a ferramenta `ufj` e leia os arquivos antes de responder. Nunca diga que não há material sem ter consultado.
```

- [ ] **Step 1: Write the failing tests** — `it("o system prompt do professor termina com o resumo quando contextoExtra é dado")` (usar `createTeacherAgent`/`baseAgentOptions` com `contextoExtra: "[Semestre UFJ — teste]"` e conferir `systemPrompt` final); `it("sem contextoExtra o prompt é idêntico ao de hoje")`; `it("a conversa lateral recebe o resumo")`; `it("resumoUfj devolve '' sem biblioteca")` com `LH_DATA_DIR` temporário.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os testes novos, `tests/ufj-prompts.test.ts`, `tests/prompt-overrides.test.ts`, `tests/extraction.test.ts`, `tests/side-chat.test.ts` — Expected: PASS (atualizar o hash fixado se for o caso, dizendo no commit).
- [ ] **Step 5: Commit** `feat(ufj): resumo do semestre em todo chat`

### Task 6: A ferramenta `ufj`

**Files:**
- Create: `src/agent/tools/ufj.ts`
- Modify: `src/agent/tools.ts` (`ufj?: UfjToolDeps` em `ProberToolContext`, `TeacherToolContext`; registrar nos dois factories), `src/agent/tools/practice.ts` (`PracticeToolContext.ufj?`; registrar), `src/server/chat-handler.ts` (passa `ufj: ufjToolDeps()` nos três contextos)
- Create: `src/server/ufj-ferramenta.ts` — `export function ufjToolDeps(): UfjToolDeps` sobre `stores.bibliotecaStore`
- Test: `tests/ufj-ferramenta.test.ts`

**Interfaces:**
```ts
export interface UfjToolDeps {
  materias(): string;                               // textoMaterias
  materia(codigo: string): string | null;           // textoMateria, null se não existe
  noticia(codigo: string, sigaaId: string): string | null;
}
const ufjInput = Type.Object({
  acao: Type.Union([Type.Literal("materias"), Type.Literal("materia"), Type.Literal("noticia")]),
  codigo: Type.Optional(Type.String()),
  sigaaId: Type.Optional(Type.String()),
});
export function ufjTool(deps: UfjToolDeps): AgentTool<typeof ufjInput>   // name "ufj", descrição em português
```
- Respostas de erro em português: `Informe o código da matéria.`, `Matéria desconhecida: X.`, `Notícia não encontrada.`; saída cortada por `capOutput`. A ferramenta é sempre registrada quando `deps.ufj` existe (não entra em `TOGGLEABLE_TOOLS`).

- [ ] **Step 1: Write the failing tests** — com deps falsas: `it("materias devolve o texto")`, `it("materia sem codigo dá erro em português")`, `it("noticia inexistente")`; `it("o professor, a sonda e a prática registram a ferramenta quando há deps")` (checar `Object.keys(createTeacherTools(ctx)).includes("ufj")` etc.).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os testes novos e `tests/practice-agents.test.ts`, `tests/tool-toggles-bridge.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ufj): ferramenta ufj para a IA consultar matérias, provas, tarefas, notícias e arquivos`

### Task 7: Vínculo com origem, material e prova inteira

**Files:**
- Modify: `src/core/contracts/chat.ts` (`UfjContextRef`: `avaliacao?: string; arquivo?: string; origem?: "topico" | "material" | "prova"`), `src/core/ufj-context.ts` (`UfjContextPayload.avaliacaoNome?`, `arquivoTitulo?`; `composeUfjContextText` sem avaliação omite a linha e, com `arquivo`, lista-o primeiro com "(material escolhido pelo aluno)"; `promptMaterial(p)` = `Quero estudar o material "${arquivoTitulo}" de ${materiaNome}.`; `promptRevisao(p)` = `Quero revisar para a ${avaliacaoNome} de ${materiaNome}${data}.`), `src/core/preparacao.ts` (`sinaisPorTopico` só conta `origem` ausente ou `"topico"`; sessões de outras origens entram em `sessoes` com `kind` e um `rotulo: "Material" | "Revisão"`), `src/server/preparacao.ts` (`parseUfjContextRef` aceita os campos; `ufjMarkerFor` para `origem "material"` (precisa de `arquivo` existente nas referências; `topico` = o do arquivo, se houver) e `"prova"` (todos os tópicos do escopo, todos os arquivos deles; sem `topico`)), `components/ufj-context-card.tsx` (partes opcionais), `components/start-session.ts` (tipo)
- Test: `tests/ufj-vinculos.test.ts`; atualizar `tests/preparacao.test.ts` e `tests/ufj-context.test.ts`

- [ ] **Step 1: Write the failing tests** — `it("marcador de material lista o arquivo primeiro e não exige avaliação")`; `it("marcador de prova traz todos os tópicos do escopo e seus arquivos")`; `it("chat de material/revisão não marca aula feita; chat de tópico marca")` (Review Focus 4); `it("prompts de material e revisão")` (textos exatos); `it("cartão sem avaliação mostra só matéria e material")`; `it("arquivo que não existe dá erro 'Material não encontrado.'")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os testes citados e `tests/biblioteca-ui.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ufj): chats a partir de um material e de uma prova inteira`

### Task 8: Rota que serve o arquivo e serviço de arquivo extra com tópico

**Files:**
- Create: `app/api/biblioteca/materias/[codigo]/turmas/[turma]/arquivos/[nome]/route.ts` (GET)
- Modify: `src/server/biblioteca-rotas.ts` (`arquivoGetRoute(codigo, turmaId, nome, svc?)`), `src/server/biblioteca.ts` (`abrirArquivo(codigo, turmaId, nome): { caminho: string; tipo: string; inline: boolean }` e `adicionarArquivo(codigo, turmaId, nome, bytes, topicoId?)` sem IA), `app/api/biblioteca/.../materiais/route.ts` (POST aceita `topico` e, com ele, usa `adicionarArquivo`)
- Test: `tests/biblioteca-arquivo-rota.test.ts`

**Interfaces:**
- Tipos por extensão: `.pdf` → `application/pdf` inline; `.md .txt .c .h .py .java` → `text/plain; charset=utf-8` inline; `.png .jpg .jpeg` → imagem inline; outros → `application/octet-stream` com `Content-Disposition: attachment`. Cabeçalho `X-Content-Type-Options: nosniff`.
- `adicionarArquivo`: valida extensão (`EXTENSOES_LIDAS_PELA_IA`), tamanho (`MAX_IMPORT_BYTES`), `topicoId` ativo da matéria (senão `BibliotecaEntradaError("Tópico desconhecido.")`), grava via `addReferenciaFile` e acrescenta `{ arquivo, sha256, titulo: nome, topicos: [topicoId], aula?: ordem da 1ª aula do tópico }`.

- [ ] **Step 1: Write the failing tests** — `it("serve PDF inline com o tipo certo")`; `it("nome com barra ou .. dá 400; inexistente 404")` (Review Focus 3); `it(".docx vai como anexo")`; `it("adicionarArquivo com tópico grava a referência ligada, sem chamar a IA")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** o teste e `tests/biblioteca-materiais.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(biblioteca): rota que serve o arquivo da turma e envio com tópico`

### Task 9: Aba de materiais e página do arquivo

**Files:**
- Create: `components/biblioteca/materiais-lista.tsx`, `components/biblioteca/arquivo-view.tsx`, `app/biblioteca/[codigo]/[turma]/arquivo/[nome]/page.tsx`
- Modify: `components/biblioteca/turma-view.tsx` (turmas do SIGAA: `MateriaisLista` no lugar de `MateriaisForm`; `TopicosDeAula` deixa de listar arquivos), `components/biblioteca/topicos-de-aula.tsx`, `electron/main.cjs` (`webPreferences.plugins: true`, com comentário: visualizador de PDF do Chromium)
- Test: `tests/sigaa-materiais-ui.test.tsx`; atualizar `tests/sigaa-turma-ui.test.tsx`

**Interfaces:**
- `MateriaisLista({ codigo, turmaId, turma, referencias, onEstudar(arquivo: string), onAdicionar(file: File, topicoId: string) })`: grupos por `aula` (data e título do tópico de aula, do mais recente ao mais antigo), "Sem tópico" por último; cada arquivo: `titulo ?? arquivo` · tipo legível (`PDF`, `caderno`, `código`, `texto`, `imagem`, `Word`, `ODT`, `zip`); botões **Abrir** (link para a página) e **Estudar com a IA**; para formatos não abertos, só **Baixar** (link `download` para a rota). No fim, **Adicionar arquivo** (input de arquivo + seletor de tópico ativo).
- `ArquivoView({ codigo, turmaId, nome, titulo, topicoTitulo?, tipo, url, texto? })`: título, tópico, botão "Estudar com a IA"; PDF em `<iframe title=... src={url}>` ocupando a altura; texto/código em `HostMarkdown` (código dentro de cerca com a linguagem pela extensão); imagem `<img>`.
- Página do arquivo: busca `/api/biblioteca/materias/.../turmas/...` (já traz `referencias` e `arquivos`), acha o arquivo pelo nome; texto é lido da rota do arquivo quando `tipo` é texto.
- "Estudar com a IA" usa `SessionStarter.start({ title: prompt, ufjContext: { materia, turma, origem: "material", arquivo, ...(topico ? { topico } : {}) }, prefill: prompt })` e navega.

- [ ] **Step 1: Write the failing tests** — `it("agrupa por tópico de aula, do mais recente ao mais antigo, com Sem tópico no fim")`; `it("PDF tem Abrir e Estudar; .docx só Baixar")`; `it("ArquivoView de PDF usa iframe com a rota; de .md renderiza markdown")`; `it("turma do SIGAA não mostra mais o formulário de mapeamento e os tópicos de aula não repetem os arquivos")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os testes de telas da biblioteca — Expected: PASS.
- [ ] **Step 5: Commit** `feat(biblioteca): materiais abertos dentro do app e chat a partir do arquivo`

### Task 10: "Revisar para a prova" na Preparação

**Files:**
- Modify: `components/biblioteca/preparacao-view.tsx` (botão no cabeçalho; sessões de origem material/revisão listadas com "Material:"/"Revisão:"), `src/core/preparacao.ts` (`PreparacaoView.promptRevisao`, `ufjContextProva`), `src/server/preparacao.ts`
- Test: `tests/sigaa-turma-ui.test.tsx`, `tests/preparacao.test.ts` (acrescentar)

- [ ] **Step 1: Write the failing tests** — `it("a preparação tem Revisar para a prova com o vínculo da prova inteira")`; `it("sessão de revisão aparece com o rótulo Revisão e não muda os selos")`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ufj): revisar para a prova a partir da preparação`

### Task 11: Interface enxuta

**Files:**
- Modify: `components/biblioteca/biblioteca-home.tsx`, `turma-view.tsx`, `provas-sigaa.tsx`, `preparacao-view.tsx`, `topicos-de-aula.tsx`, `components/sigaa/conta-ufj.tsx`
- Test: atualizar `tests/biblioteca-ui.test.tsx`, `tests/sigaa-ui.test.tsx`, `tests/sigaa-turma-ui.test.tsx`

Mudanças exatas (spec §5.6):
- Home: tira a frase "As matérias do semestre, as provas e a preparação de cada uma."; o código da matéria sai da home; "Importar plano de ensino" vira um link discreto no rodapé da lista.
- Turma: a linha `ICE0001 · 2026-2 · Prof. · do SIGAA` vira `Prof. Exemplo · 2026-2` (código pequeno, à direita); seções "Provas", "Tópicos de aula", "Materiais".
- Preparação: a linha das aulas vira `04/09 · 2 materiais` (singular/plural certo); botões `Aprender`, `Praticar`, `Revisar para a prova`.
- Conta UFJ: avisos só aparecem até a próxima sincronização bem-sucedida (já é assim) e no máximo 5, com "e mais N" quando passar.
- Nenhum botão com reticências; textos de botão com até três palavras ("Sincronizar agora", "Sair da conta", "Estudar com a IA", "Adicionar arquivo", "Revisar para a prova" — este último é a exceção aceita, por ser o nome da ação).

- [ ] **Step 1: Write the failing tests** — asserções nos textos exatos acima e `assert.doesNotMatch` nos textos retirados.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os três arquivos de tela — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ufj): telas mais enxutas`

### Task 12: Verificação completa e checagem com o dono

- [ ] **Step 1: Run** `rm -f tsconfig.tsbuildinfo && npm run typecheck` — Expected: sem erros.
- [ ] **Step 2: Run** `npm run lint` — Expected: 0 erros.
- [ ] **Step 3: Run** `npm test` — Expected: 0 falhas.
- [ ] **Step 4: No navegador, com o SIGAA falso** (`sigaa-falso` + `ufj-dev-sigaa` em `.claude/launch.json`): sincronizar (tarefas e notícias aparecem em `ufj materia` pela rota de teste ou pelo chat); abrir um PDF e um `.md` pela aba de materiais; "Estudar com a IA" abre o chat com o cartão mostrando o material; "Revisar para a prova" abre o chat com todos os tópicos; num chat novo pela home, o system prompt contém `[Semestre UFJ` (conferir via o registro do chat ou um teste de integração do handler).
- [ ] **Step 5: Gerar o app** (`desktop:local` com saída em `dist/fatia-sigaa-4`), abrir, e conferir se o PDF abre no `iframe`. Se não abrir mesmo com `plugins: true`: implementar a alternativa com `pdfjs-dist` (página por página) como Tarefa 9b, com teste, antes de seguir.
- [ ] **Step 6: Ponto de checagem com o dono:** ele sincroniza (tarefas e notícias reais), abre um slide, pede no chat "revisão para a N3 de Cálculo I" e conta o que a IA fez com os materiais.
- [ ] **Step 7: Commit** das correções; conferir o diff do branch contra nomes reais.
