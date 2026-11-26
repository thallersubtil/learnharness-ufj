# SIGAA, fatia 1 (fatia fina): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O aluno conecta a conta UFJ, clica em **Sincronizar agora**, e as matérias do semestre aparecem montadas pelo SIGAA: tópicos de aula, arquivos do professor ligados aos tópicos, provas com data editável e selo de origem, o que cai em cada prova calculado pelas datas, e Aprender/Praticar usando os arquivos do tópico.

**Architecture:** Um leitor HTTP do SIGAA no servidor do app (`src/server/sigaa/`) faz login, navega pelos comandos JSF e devolve dados puros (tipos em `src/core/sigaa.ts`). Uma função pura do core monta, a partir deles, a `Materia`, a `Turma` e as `Referencias` que a fatia 1 já usa, e grava pelo `BibliotecaStore`. Assim a preparação, o marcador `ufj-context` e Aprender/Praticar funcionam sem mudar de forma. A senha é cifrada pelo processo principal do Electron (`safeStorage`) por um canal IPC novo.

**Tech Stack:** TypeScript, Next.js 16, Electron, `node:test` via `tsx`, `linkedom` (já é dependência), `fetch` do Node 24.

**Spec:** `docs/superpowers/specs/2026-11-24-ufj-sigaa-design.md` (§10, item 1). As fatias 2 (tarefas, notícias, referências, vídeos, Agenda) e 3 (sugestões de data, plano do SIGAA, agendamento, diagnóstico) terão planos próprios.

## Global Constraints

- Todo texto novo do app em português do Brasil: telas, mensagens de erro, avisos, nomes de botão.
- O repositório é público. Páginas de exemplo e testes usam só dados inventados (`ICE0001`, "Disciplina Teste", `aluno.teste`, "Prof. Exemplo"). As páginas reais em `~/Library/Application Support/LearnHarness UFJ/diagnostico-sigaa/2026-11-24-teste/` servem de modelo de estrutura; nenhum texto delas é copiado para o repositório. Antes de cada commit, conferir o diff contra nomes reais.
- A senha só vai para `https://sigaa.sistemas.ufj.edu.br`, no POST de login. Trocar a base do SIGAA só é aceito com `NODE_ENV === "test"` ou com `LH_SIGAA_BASE_URL` definida e `LH_DESKTOP_SERVER !== "1"`.
- Pelo menos 800 ms entre pedidos ao SIGAA em produção (`esperarMs`, injetável; 0 nos testes).
- Nunca repetir o login depois de "Usuário e/ou senha inválidos".
- Nunca abrir as seções: Participantes, Ver Notas, Frequência, Fóruns, Chats Agendados, Enquetes, Questionários, Situação dos Discentes, Estatísticas de Notas, Gerenciar Perfil, Twitter, Ver Grupo.
- Páginas do SIGAA são decodificadas pelos bytes com o charset da resposta (padrão `windows-1252`). Nunca `Response.text()`.
- Código adaptado do sigaa-mcp leva no topo: `// Adaptado de sigaa-mcp (https://github.com/Pedromaia0/sigaa-mcp). Copyright (c) 2026 Pedro Maia. Licença MIT.`
- Zonas de import do ESLint: `components/` só importa `@/src/core`; `app/` importa core e server; `src/core/` não importa agent, server nem store. Arquivos de rota só exportam métodos HTTP; `params` é uma Promise.
- Nenhum teste acessa a rede. Rodar um arquivo: `NODE_ENV=test npx tsx --test tests/<arquivo>`. Antes de confiar no `tsc`, apagar `tsconfig.tsbuildinfo`.

## Review Focus

1. **Sessão cai no meio da sincronização** (o SIGAA devolve a tela de login ao abrir uma turma): aquela turma fica com os dados anteriores e um aviso; a sincronização não tenta logar de novo. Teste na Tarefa 8.
2. **Professor renomeia ou insere um tópico entre duas sincronizações**: os ids dos tópicos de estudo já existentes não mudam, e as sessões continuam abrindo. Teste na Tarefa 3.
3. **Uma avaliação some do SIGAA ou perde a data**: a prova continua no app, com a última data, e passa a ser "à mão". Teste na Tarefa 3.
4. **Senha e nomes com acento** (ISO-8859-1): o login envia `%E7` para "ç", e "CÁLCULO" chega como "Cálculo". Testes nas Tarefas 4 e 5.
5. **O aluno muda uma data enquanto a sincronização roda**: a escrita de cada turma relê a turma e funde, sem `await` entre ler e gravar, então a edição não se perde (a data do SIGAA ainda vence nas provas com origem SIGAA). Teste na Tarefa 8.

---

### Task 1: Campos do SIGAA nos tipos da biblioteca

**Files:**
- Modify: `src/core/biblioteca.ts` (tipos `Aula`, `Avaliacao`, `Turma`, `Referencias`; `parseAula`, `parseAvaliacao`, `parseTurma`, `parseReferencias`)
- Test: `tests/sigaa-tipos.test.ts`

**Interfaces:**
- Produces (todos opcionais, o formato continua `1`):
  - `Aula.sigaa?: { titulo: string; fim?: string; prova?: true; cancelada?: true }`
  - `Avaliacao.origemData?: "sigaa" | "manual" | "plano"`, `Avaliacao.sigaaId?: string`, `Avaliacao.hora?: string` (`HH:MM`), `Avaliacao.escopoManual?: { incluidos: string[]; excluidos: string[] }`
  - `Turma.sigaa?: { idTurma: string; sufixo?: string; sincronizadoEm: string }`
  - `Referencias["arquivos"][number].sigaaId?: string`, `.aula?: number` (a `ordem` da aula onde o professor pôs o arquivo)
  - `export const ORIGENS_DATA = ["sigaa", "manual", "plano"] as const`

- [ ] **Step 1: Write the failing tests** — `describe("campos do SIGAA")`:
  - `it("ida e volta preserva os campos novos")`: `parseTurma` de uma `turmaValida()` com `sigaa: { idTurma: "123", sufixo: "TA", sincronizadoEm: "2026-11-24T12:00:00.000Z" }`, uma aula com `sigaa: { titulo: "Pilhas", fim: "2026-08-26", prova: true }` e uma avaliação com `origemData: "sigaa", sigaaId: "999", hora: "20:45", escopoManual: { incluidos: ["limites"], excluidos: [] }` devolve exatamente esses campos (`assert.deepEqual`).
  - `it("recusa origem desconhecida, hora fora de HH:MM e id de tópico inválido no escopo manual")`: `assert.throws(..., /origemData/)`, `/hora/`, `/não é um id de tópico válido/`.
  - `it("referência guarda sigaaId e aula")`: `parseReferencias({ formato: 1, arquivos: [{ arquivo: "a.pdf", topicos: [], sha256: "0".repeat(64), sigaaId: "55", aula: 3 }] })` devolve `sigaaId: "55", aula: 3`.
  - `it("turma sem os campos novos continua igual")`: `assert.deepEqual(parseTurma(turmaValida()), turmaValida())`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-tipos.test.ts` — Expected: FAIL (campos descartados pelo parse).
- [ ] **Step 3: Implement** os tipos e a leitura dos campos nos `parse*`, com mensagens no padrão `fail(onde, ...)` existente (ex.: `o campo "origemData" precisa ser sigaa, manual ou plano`; `o campo "hora" precisa estar no formato HH:MM`).
- [ ] **Step 4: Run** o teste novo e `tests/biblioteca-core.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): campos do SIGAA na turma, nas provas e nas referências`

### Task 2: Escopo por datas, com limites e escolhas à mão; editar data e prova

**Files:**
- Modify: `src/core/biblioteca-escopo.ts`
- Create: `src/core/provas.ts` (exportado no barril `src/core/index.ts`)
- Test: `tests/sigaa-escopo.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `computeEscopos(avaliacoes, aulas)` passa a tratar toda aula com `sigaa?.prova` como **limite** (posição = `aula.ordem`), além das provas regulares. Sem aulas assim, o resultado é o de hoje.
  - `aplicarEscopoManual(calculado: string[], manual?: Avaliacao["escopoManual"]): string[]` — tira `excluidos`, acrescenta `incluidos` que faltam, no fim.
  - `recalcularTurma(turma: Turma): Turma` — `computePosicoes` + `computeEscopos` + `aplicarEscopoManual` em cada prova. Só para turmas com `turma.sigaa`; sem `sigaa`, devolve a turma igual.
  - Em `src/core/provas.ts`:
    - `definirDataProva(turma: Turma, avaliacaoId: string, data: string | null): Turma` — grava a data com `origemData: "manual"` (com `null`, apaga `data` e `origemData`), depois `recalcularTurma`. Prova desconhecida: `BibliotecaNaoEncontradaError("Prova não encontrada.")`. Data fora de `AAAA-MM-DD`: `BibliotecaEntradaError("Informe a data no formato AAAA-MM-DD.")`.
    - `adicionarProva(turma: Turma, entrada: { nome: string; data?: string }): Turma` — id `slugify(nome)` (com `-2`, `-3` se repetir), `tipo: "prova-escrita"`, `escopo: { topicos: [] }`, `origemData: "manual"` quando há data; nome vazio: `BibliotecaEntradaError("Dê um nome à prova.")`; depois `recalcularTurma`.
    - `definirEscopoProva(turma: Turma, avaliacaoId: string, topicos: string[]): Turma` — calcula o escopo sem escolhas à mão e grava `escopoManual = { incluidos: topicos − calculado, excluidos: calculado − topicos }`, depois `recalcularTurma`.

- [ ] **Step 1: Write the failing tests** — fixture local com aulas 1–6 (datas 01/09…06/09 de 2026; aula 3 com `sigaa.prova` em 2026-09-03; aula 5 com `topicos: ["regra-da-cadeia"]`), `sigaa` preenchido, e uma prova `p3` com data 2026-09-06:
  - `it("a aula de prova é limite: o escopo começa depois dela")`: escopo de `p3` = tópicos das aulas 4 e 5, nunca os das aulas 1 e 2.
  - `it("prova na mesma data de uma aula de prova fica na posição dela")`: com `aula 3.avaliacaoId = "p1"` e `p1.data = "2026-09-03"`, o escopo de `p1` = tópicos das aulas 1 e 2.
  - `it("escolhas à mão vencem o cálculo e sobrevivem ao recálculo")`: `definirEscopoProva(t, "p3", ["limites", "regra-da-cadeia"])` e depois `recalcularTurma` mantêm exatamente essa lista, com `escopoManual.excluidos` contendo o que saiu.
  - `it("mudar a data muda o escopo e marca origem manual")`: `definirDataProva(t, "p3", "2026-09-04")` → escopo só da aula 4; `origemData === "manual"`.
  - `it("null apaga a data e a origem")`.
  - `it("adicionarProva cria 3a-prova e repete com sufixo")`: `adicionarProva(t, { nome: "3ª prova" })` cria `id: "3a-prova"`; de novo, `"3a-prova-2"`.
  - `it("turma sem sigaa não é recalculada")`: `recalcularTurma(turmaValida())` devolve o mesmo objeto em `deepEqual`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-escopo.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções acima.
- [ ] **Step 4: Run** o teste novo e `tests/biblioteca-escopo.test.ts` — Expected: PASS (os testes antigos não mudam).
- [ ] **Step 5: Commit** `feat(sigaa): escopo por datas com limites de prova e escolhas à mão`

### Task 3: Montar matéria, turma e referências a partir da leitura do SIGAA

**Files:**
- Create: `src/core/sigaa.ts` (tipos da leitura e montagem; exportado no barril)
- Modify: `src/server/biblioteca-ia.ts` (`EXTENSOES_MATERIAIS` re-exporta a constante do core)
- Test: `tests/sigaa-montar.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `slugify`, `parseMateria`, `parseTurma`.
- Produces:
  ```ts
  export interface SigaaArquivo { sigaaId: string; titulo: string; descricao: string; topicoDeAula: string }
  export interface SigaaTopicoDeAula { titulo: string; inicio?: string; fim?: string; descricao: string }
  export interface SigaaAvaliacao { sigaaId: string; data: string; hora?: string; descricao: string }
  export interface SigaaTurmaLida {
    idTurma: string; codigo: string; nome: string; semestre: string; sufixo?: string; docente?: string;
    topicos: SigaaTopicoDeAula[]; avaliacoes: SigaaAvaliacao[]; arquivos: SigaaArquivo[];
  }
  export interface Montagem { materia: Materia; turma: Turma; referencias: Referencias; avisos: string[] }
  export function normalizarTitulo(s: string): string
  export function nomeDeDisciplina(s: string): string
  export function ehTopicoDeProva(titulo: string): boolean
  export function ehAulaCancelada(titulo: string): boolean
  export function idTurmaSigaa(semestre: string, sufixo?: string): string
  export function montarDoSigaa(
    lida: SigaaTurmaLida,
    anterior: { materia: Materia | null; turma: Turma | null; referencias: Referencias },
    agora: string,
  ): Montagem
  ```
- Regras fixadas pelo spec e pelo teste real:
  - `normalizarTitulo`: sem acentos, minúsculas, espaços colapsados, sem pontuação no fim.
  - `nomeDeDisciplina("PROGRAMAÇÃO ORIENTADA A OBJETOS")` → `"Programação Orientada a Objetos"`; `"CÁLCULO I"` → `"Cálculo I"`; `"ESTRUTURA DE DADOS I"` → `"Estrutura de Dados I"`. Conectivos em minúscula: a, o, e, de, da, do, das, dos, em, para, com. Algarismos romanos (I a X) em maiúscula.
  - `ehTopicoDeProva`: o título normalizado **começa** com `prova`, `avaliacao`, `exame`, `n1`–`n4`, `av1`–`av4` ou um ordinal seguido de `prova` (`2a prova`). `"Avaliação da aprendizagem"` → true; `"Correção da avaliação e derivadas implícitas."` → false.
  - `ehAulaCancelada`: começa com `nao havera aula`.
  - `idTurmaSigaa("2026-2", "TA")` → `"2026-2-turma-ta"`; sem sufixo → `"2026-2-sigaa"`. A turma usa `docente: { nome: lida.docente ?? "", slug: "sigaa" }`, `criteriosMedia: ""` quando é nova.
  - Matéria nova: `curso: ""`, `unidade: ""`, `ementa: ""`, listas vazias. Matéria existente: só os `topicos` mudam (os da turma SIGAA entram; os de outras turmas ficam).
  - Aulas: uma por tópico de aula, na ordem lida; `ordem = i + 1`, `rotulo = String(ordem)`, `data = inicio`, `conteudo = titulo` (mais ` — descricao` quando houver), `sigaa = { titulo, fim?, prova?, cancelada? }`. Aula de prova ou cancelada tem `topicos: []`.
  - Identidade do tópico de estudo (spec §7.4): mesmo `normalizarTitulo` → mesmo id; senão, título novo na **mesma posição** e com o **mesmo período** de um título que sumiu → mesmo id, `titulo` atualizado; senão, id novo `slugify(titulo)` com sufixo `-2`… se já existir na matéria. Tópico que some: `arquivado: true` se alguma turma o cita; senão, sai.
  - Provas: cada `SigaaAvaliacao` vira (ou atualiza) a prova `id: "sigaa-" + sigaaId`, `nome: descricao`, `tipo: "prova-escrita"`, `data`, `hora` só se `HH:MM`, `origemData: "sigaa"`, `sigaaId`. A data do SIGAA sempre sobrescreve. Prova com `sigaaId` que não veio mais: fica, com a última data, `origemData: "manual"`, sem `sigaaId`. Provas sem `sigaaId` (à mão) ficam como estão. Uma aula de prova recebe `avaliacaoId` da prova com a mesma data, se houver.
  - Referências: cada `SigaaArquivo` cujo `topicoDeAula` bate (por `normalizarTitulo`) com um tópico de aula ganha `aula = ordem` e `topicos = [id do tópico de estudo]`; sem par, `topicos: []`. A montagem só **liga** arquivos já presentes em `anterior.referencias` pelo `sigaaId`; quem baixa é a Tarefa 8.
  - Só arquivos com extensão em `EXTENSOES_LIDAS_PELA_IA` ganham `topicos`; os outros (`.zip`, `.docx`, `.odt`…) ficam com `topicos: []` e só `aula`, para aparecer na linha do tempo sem ir para o contexto da IA. `export const EXTENSOES_LIDAS_PELA_IA = [".pdf", ".ipynb", ".md", ".txt", ".c", ".h", ".py", ".java", ".png", ".jpg", ".jpeg"] as const` passa a morar em `src/core/sigaa.ts`, e `EXTENSOES_MATERIAIS` de `src/server/biblioteca-ia.ts` vira um re-export dela.
  - Avisos (vão para o estado da sincronização e para a tela): data do SIGAA que mudou → `O SIGAA mudou a {nome} de {dd/mm} para {dd/mm}.`; escopo de prova futura que ganhou tópicos → `A {nome} passou a incluir: {títulos separados por ", "}.`
  - No fim: `recalcularTurma`, `turma.sigaa = { idTurma, sufixo, sincronizadoEm: agora }`, `importadoEm` (só na criação) e `revisadoEm = agora`. A saída passa por `parseMateria`/`parseTurma`.

- [ ] **Step 1: Write the failing tests** — leitura fictícia "ICE0001 - DISCIPLINA TESTE", semestre "2026-2", sufixo "TA", tópicos: "Limites" (01/09), "Não Haverá Aula" (02/09), "Avaliação da aprendizagem" (03/09), "Regra da cadeia" (04/09); uma avaliação `sigaaId "999"` em 2026-09-10 "2ª unidade"; um arquivo `sigaaId "55"` no tópico "Regra da cadeia".
  - `it("monta matéria nova, turma 2026-2-turma-ta e aulas na ordem")`: nome `"Disciplina Teste"`, 4 aulas, aula 2 `sigaa.cancelada`, aula 3 `sigaa.prova`, tópicos de estudo `["limites", "regra-da-cadeia"]`.
  - `it("a prova do SIGAA tem escopo depois da aula de prova")`: `sigaa-999` com `origemData "sigaa"` e escopo `["regra-da-cadeia"]`.
  - `it("liga o arquivo ao tópico do professor")`: com `anterior.referencias` contendo `{ arquivo: "regra.pdf", sigaaId: "55", ... }`, a saída tem `topicos: ["regra-da-cadeia"], aula: 4`.
  - `it("renomear na mesma posição e período mantém o id")` (Review Focus 2): segunda montagem com "Regra da cadeia (derivadas)" no lugar → id continua `regra-da-cadeia`, título novo.
  - `it("inserir um tópico antes não muda os ids existentes")` (Review Focus 2).
  - `it("data do SIGAA sobrescreve a data à mão")`: anterior com `sigaa-999` em 2026-09-12 `origemData "manual"` → volta para 2026-09-10 `"sigaa"`.
  - `it("avaliação que some do SIGAA fica como à mão")` (Review Focus 3).
  - `it("hora '53' é descartada; '20:45' fica")`.
  - `it("avisa a data que o SIGAA mudou e os tópicos que entraram na prova")`: textos exatos das regras.
  - `it("arquivo .docx fica na aula sem ir para os tópicos")`.
  - `it("matéria existente: nome e ementa ficam, tópicos de outra turma ficam")`.
  - `it("nomeDeDisciplina, ehTopicoDeProva e ehAulaCancelada")` com os exemplos das regras acima.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-montar.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/core/sigaa.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): montar matéria, turma e referências a partir da leitura`

### Task 4: Sessão HTTP do SIGAA, ajudantes JSF, login e o SIGAA falso dos testes

**Files:**
- Create: `src/server/sigaa/http.ts`, `src/server/sigaa/jsf.ts`, `src/server/sigaa/login.ts`, `src/server/sigaa/erros.ts`
- Create: `tests/helpers/sigaa-falso.ts`, `tests/fixtures/sigaa/login.html`, `login-recusado.html`, `aviso.html`, `portal.html`
- Test: `tests/sigaa-login.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // erros.ts — mensagens em português
  export class SigaaSenhaRecusadaError extends Error {}   // "O SIGAA recusou o usuário ou a senha."
  export class SigaaIndisponivelError extends Error {}    // "Não consegui falar com o SIGAA agora. Tente de novo mais tarde."
  export class SigaaEstruturaError extends Error {}       // "O SIGAA mudou de um jeito que o app não entende: <onde>."
  export class SigaaSessaoExpiradaError extends Error {}  // "A sessão do SIGAA caiu no meio da leitura."
  // http.ts
  export const SIGAA_BASE = "https://sigaa.sistemas.ufj.edu.br";
  export function baseDoSigaa(env?: NodeJS.ProcessEnv): string  // aplica a regra das Global Constraints
  export interface Pagina { url: string; status: number; tipo: string; bytes: Uint8Array; html: string; headers: Headers }
  export class SigaaSessao {
    constructor(opcoes: { base: string; esperarMs: number; fetch?: typeof fetch; timeoutMs?: number })
    get(caminhoOuUrl: string): Promise<Pagina>
    postar(url: string, campos: [string, string][]): Promise<Pagina>   // corpo x-www-form-urlencoded em ISO-8859-1
  }
  export function corpoLatin1(campos: [string, string][]): string
  // jsf.ts
  export interface LinkJsf { form: string; params: Record<string, string> }
  export function linkJsf(onclick: string | null | undefined): LinkJsf | null
  export function documento(html: string): Document   // linkedom
  export function camposDoForm(doc: Document, formId: string, extras: Record<string, string>): [string, string][]
  export function clicar(sessao: SigaaSessao, pagina: Pagina, link: LinkJsf): Promise<Pagina>
  // login.ts
  export const PORTAL = "/sigaa/portais/discente/discente.jsf";
  export function entrar(sessao: SigaaSessao, usuario: string, senha: string): Promise<Pagina>   // devolve o portal
  export function sair(sessao: SigaaSessao): Promise<void>   // GET /sigaa/logar.do?dispatch=logOff, sem lançar
  ```
- O comportamento validado no teste real está no spec §6 e §7.3. `SigaaSessao` segue redirecionamentos à mão (até 10), guarda cookies por nome só na memória, recusa URL de outro host (`SigaaEstruturaError`), espera `esperarMs` antes de cada pedido e decodifica pelo charset (`windows-1252` quando não diz). Falha de rede ou timeout (padrão 20 s) vira `SigaaIndisponivelError`. Nenhuma mensagem de erro ou log leva corpo de pedido, cookie ou campo de formulário.
- `entrar`: GET `/sigaa/verTelaLogin.do`; acha `form[name="loginForm"]` (senão, `SigaaEstruturaError("tela de login")`); envia todos os inputs do formulário com `user.login`, `user.senha`, `width=1440`, `height=900`; se a resposta tem `loginForm` ou o texto "Usuário e/ou senha inválidos", lança `SigaaSenhaRecusadaError`; depois faz GET do `PORTAL` (pula a página de aviso) e devolve o portal; se o portal voltar com `loginForm`, lança `SigaaSessaoExpiradaError`.
- `tests/helpers/sigaa-falso.ts`: `iniciarSigaaFalso(opcoes?: { senhaCerta?: string; avisoDepoisDoLogin?: boolean; derrubarSessaoDepois?: number; secaoQuebrada?: string }): Promise<{ base: string; pedidos: { metodo: string; caminho: string; corpo: string }[]; fechar(): Promise<void> }>` — servidor `node:http` em `127.0.0.1:0` que serve as páginas de `tests/fixtures/sigaa/` codificadas em ISO-8859-1, emite `JSESSIONID`, exige o cookie nas páginas internas, confere `javax.faces.ViewState` e os parâmetros dos comandos JSF, e responde como o SIGAA nos cenários das opções. As páginas de exemplo copiam a **estrutura** das páginas reais (ids, classes, formulários, `jsfcljs`) com texto inventado. A Tarefa 6 acrescenta as páginas da turma.

- [ ] **Step 1: Write the failing tests** — `describe("login no SIGAA")`:
  - `it("entra, pula o aviso e chega ao portal")` com `avisoDepoisDoLogin: true`: `entrar` devolve página com URL terminando em `discente.jsf`.
  - `it("senha recusada lança e faz um único POST de login")`: `assert.rejects(..., SigaaSenhaRecusadaError)`; `pedidos.filter(p => p.caminho.startsWith("/sigaa/logar.do")).length === 1`.
  - `it("senha com acento vai em ISO-8859-1")` (Review Focus 4): senha `"çã1"` → corpo do POST contém `user.senha=%E7%E31`.
  - `it("recusa redirecionamento para outro host")`.
  - `it("baseDoSigaa: produção ignora LH_SIGAA_BASE_URL no app de desktop")`: `baseDoSigaa({ LH_SIGAA_BASE_URL: "http://x", LH_DESKTOP_SERVER: "1" })` → `SIGAA_BASE`; `baseDoSigaa({ LH_SIGAA_BASE_URL: "http://x" })` → `"http://x"`.
  - `it("linkJsf lê formulário e parâmetros")` com o `onclick` de exemplo do portal.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-login.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** os arquivos acima e o SIGAA falso.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): sessão HTTP, ajudantes JSF e login`

### Task 5: Leitores das páginas (portal, turma, avaliações, arquivos)

**Files:**
- Create: `src/server/sigaa/ler-portal.ts`, `ler-turma.ts`, `ler-avaliacoes.ts`, `ler-arquivos.ts`
- Create: `tests/fixtures/sigaa/turma-principal.html`, `turma-avaliacoes.html`, `turma-avaliacoes-vazia.html`, `turma-arquivos.html` (e uma segunda turma em `turma2-*.html`)
- Test: `tests/sigaa-leitores.test.ts`

**Interfaces:**
- Consumes: `documento`, `linkJsf` (Task 4); tipos `SigaaTopicoDeAula`, `SigaaAvaliacao`, `SigaaArquivo` (Task 3).
- Produces:
  ```ts
  export interface TurmaNoPortal { idTurma: string; nome: string; link: LinkJsf }
  export function lerPortal(html: string): TurmaNoPortal[]   // comandos JSF com parâmetro "idTurma", sem repetir
  export interface CabecalhoTurma { codigo: string; nome: string; semestre: string; sufixo?: string }
  export function lerCabecalho(html: string): CabecalhoTurma // "ICE0001 - DISCIPLINA TESTE (2026.2 - TA)" → semestre "2026-2", sufixo "TA"
  export function lerTopicos(html: string): SigaaTopicoDeAula[]   // .topico-aula / .titulo / .conteudotopico
  export function lerDocente(html: string): string | undefined   // "Cadastrado por:" da última notícia, em Nome Próprio
  export interface ItemDeMenu { rotulo: string; link: LinkJsf }
  export function lerMenu(html: string): ItemDeMenu[]   // só links do formulário formMenu
  export function lerAvaliacoes(html: string): SigaaAvaliacao[]   // linhas de "Datas de Avaliações"; id do comando "Visualizar"
  export interface ArquivoNaLista extends SigaaArquivo { link: LinkJsf }
  export function lerArquivos(html: string): ArquivoNaLista[]
  ```
- Regras: título do tópico sem o período; período `(dd/mm/aaaa - dd/mm/aaaa)` ou `(dd/mm/aaaa)` vira `inicio`/`fim` em `AAAA-MM-DD`; "Nenhum item foi encontrado" → lista vazia; cabeçalho ausente → `SigaaEstruturaError("cabeçalho da turma")`; `descricao` do tópico é o texto do conteúdo sem os nomes dos materiais.

- [ ] **Step 1: Write the failing tests** — com as páginas de exemplo:
  - `it("portal: duas turmas com idTurma")`.
  - `it("cabeçalho com acento decodificado")` (Review Focus 4): a página servida em ISO-8859-1 com "CÁLCULO TESTE" → `nome: "CÁLCULO TESTE"` (o título-caso é da Tarefa 3).
  - `it("tópicos: período, data única da aula cancelada, prova como tópico")`.
  - `it("menu: só itens de formMenu, com os rótulos da UFJ")`.
  - `it("avaliações: id, data, hora e descrição; vazia vira []")`.
  - `it("arquivos: id, título, descrição e tópico de aula")`.
  - `it("docente vem do Cadastrado por, em Nome Próprio")`: `"PROF. EXEMPLO TESTE"` → `"Prof. Exemplo Teste"`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-leitores.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** os leitores.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): leitores do portal, da turma, das avaliações e dos arquivos`

### Task 6: Navegar o SIGAA inteiro e baixar arquivos novos

**Files:**
- Create: `src/server/sigaa/navegar.ts`, `src/server/sigaa/ipynb.ts`
- Modify: `tests/helpers/sigaa-falso.ts` (abrir turma, menu, download)
- Test: `tests/sigaa-navegar.test.ts`

**Interfaces:**
- Consumes: Tasks 4–5.
- Produces:
  ```ts
  export const SECOES_LIDAS = ["Avaliações", "Arquivos"] as const;
  export const SECOES_PROIBIDAS: readonly string[]   // a lista das Global Constraints
  export function podeLerSecao(rotulo: string): boolean   // compara sem acentos e sem caixa
  export interface ArquivoBaixado { sigaaId: string; nome: string; bytes: Uint8Array }
  export interface LeituraDoSigaa { turmasLidas: number; falhas: { idTurma: string; nome: string; erro: string }[] }
  export function lerSigaa(sessao: SigaaSessao, portal: Pagina, opcoes: {
    jaBaixado: (lida: Pick<SigaaTurmaLida, "codigo" | "semestre" | "sufixo">, sigaaId: string) => boolean;
    /** Chamada (síncrona) ao fim de cada turma, com os arquivos novos dela; quem grava é o chamador. */
    aoLerTurma: (lida: SigaaTurmaLida, baixados: ArquivoBaixado[]) => void;
    tamanhoMaximo: number;   // MAX_IMPORT_BODY_BYTES
    progresso?: (texto: string) => void;
  }): Promise<LeituraDoSigaa>
  export function ipynbParaTexto(json: string): string
  ```
- Fluxo (spec §7.3): para cada turma do portal, GET do portal (ViewState novo), `clicar` no link da turma, ler cabeçalho, tópicos e docente da página principal, abrir cada seção de `SECOES_LIDAS` a partir da página principal, baixar os arquivos da lista que `jaBaixado` não conhece. O nome do arquivo vem do `Content-Disposition`. `.ipynb` é entregue convertido: `nome + ".md"` com `ipynbParaTexto` (células markdown como texto; células de código em blocos ```` ``` ````; sem saídas). Arquivo acima de `tamanhoMaximo` é pulado com aviso na falha da turma. Erro numa turma vai para `falhas` e a leitura segue com a próxima; `SigaaSessaoExpiradaError` (a página volta com `loginForm`) é registrado na turma e interrompe as turmas seguintes, sem novo login.

- [ ] **Step 1: Write the failing tests**:
  - `it("lê as duas turmas com tópicos, avaliações e arquivos")`.
  - `it("nunca abre seção proibida")`: nenhum pedido ao SIGAA falso leva o parâmetro do item "Participantes" ou "Ver Notas"; `podeLerSecao("Ver Notas") === false`.
  - `it("baixa só o que não tem")`: `jaBaixado` devolve true para `"55"` → os `baixados` de `aoLerTurma` não trazem o `"55"` e o SIGAA falso não recebeu o download dele.
  - `it("aoLerTurma é chamada uma vez por turma, na ordem do portal")`.
  - `it("seção quebrada numa turma não derruba a outra")` com `secaoQuebrada`.
  - `it("sessão que cai para a leitura sem logar de novo")` (Review Focus 1): `derrubarSessaoDepois: 3` → `falhas[0].erro` com "sessão"; nenhum POST novo a `/sigaa/logar.do`.
  - `it("ipynb vira texto com o código e sem as saídas")`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-navegar.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): navegação pelas turmas e download dos arquivos novos`

### Task 7: Senha no chaveiro (IPC com o Electron) e a conta guardada

**Files:**
- Create: `electron/segredo-ipc.cjs`
- Modify: `electron/main.cjs` (`startServer`: anexar e descartar como `attachSubscriptionChild`)
- Create: `src/server/sigaa/segredo.ts`, `src/store/sigaa.ts`
- Modify: `config.ts` (`export const SIGAA_DIR = path.join(DATA_ROOT, "sigaa")`), `src/core/ports.ts` (`SigaaStore`)
- Test: `tests/sigaa-segredo.test.ts`

**Interfaces:**
- Produces:
  - `electron/segredo-ipc.cjs`: `attachSegredoChild(child, safeStorage) → { dispose() }`. Canal `"lh:segredo"`, mensagens `{ channel, id, op: "cifrar", texto }` → `{ channel, id, op, ok: true, value: base64 }` e `{ op: "decifrar", cifrado }` → `{ ok: true, value: texto }`; `ok: false, error: "O chaveiro do sistema não está disponível."` quando `!safeStorage.isEncryptionAvailable()` ou a operação falha.
  - `src/server/sigaa/segredo.ts`: `cifrarSegredo(texto: string): Promise<string>`, `decifrarSegredo(cifrado: string): Promise<string>`. Com o app de desktop conectado (mesma checagem `desktopConnected()` de `src/agent/subscription-bridge.ts`), usa o IPC com timeout de 10 s. Sem desktop: se `LH_SIGAA_SENHA_DEV === "1"` e `LH_DESKTOP_SERVER !== "1"`, usa `"dev:" + base64`; senão, `SigaaSegredoIndisponivelError("Guardar a senha só funciona no app de desktop.")`.
  - `SigaaStore` em `src/core/ports.ts`, implementado em `src/store/sigaa.ts` (escrita atômica, permissão 0600, sob `SIGAA_DIR`):
    ```ts
    export interface ContaSigaa { usuario: string; senhaCifrada: string }
    export type SituacaoSigaa = "sem-conta" | "ocioso" | "sincronizando" | "senha-recusada" | "erro";
    export interface EstadoSigaa { situacao: SituacaoSigaa; usuario?: string; ultimaTentativa?: string; ultimoSucesso?: string; erro?: string; avisos: string[] }
    // ContaSigaa, SituacaoSigaa e EstadoSigaa saem pelo barril de src/core (as telas usam EstadoSigaa)
    export interface SigaaStore {
      readConta(): ContaSigaa | null; writeConta(c: ContaSigaa): void; apagarConta(): void;
      readEstado(): EstadoSigaa; writeEstado(e: EstadoSigaa): void;   // readEstado sem arquivo → { situacao: "sem-conta", avisos: [] }
    }
    ```

- [ ] **Step 1: Write the failing tests**:
  - `it("o processo principal cifra e decifra pelo canal lh:segredo")`: filho falso (`EventEmitter` com `send` e `connected: true`) e `safeStorage` falso; `cifrar` devolve o base64 do falso; `decifrar` devolve o texto.
  - `it("sem chaveiro responde ok:false com a mensagem em português")`.
  - `it("ignora mensagens de outro canal")`.
  - `it("modo dev só fora do app de desktop")`: com `LH_SIGAA_SENHA_DEV=1` e sem `LH_DESKTOP_SERVER`, ida e volta funciona; com `LH_DESKTOP_SERVER=1` e sem IPC, rejeita com "só funciona no app de desktop".
  - `it("conta e estado gravados com permissão 0600")` e `it("estado sem arquivo é sem-conta")`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-segredo.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** e ligar `attachSegredoChild(child, safeStorage)` em `startServer` (descartar no `exit`, como os outros).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): senha cifrada no chaveiro pelo processo principal`

### Task 8: Serviço de sincronização, rotas e evento

**Files:**
- Create: `src/server/sigaa/sincronizar.ts`, `src/server/sigaa/rotas.ts`
- Modify: `src/server/index.ts` (exportar), `src/core/events.ts` (`"sigaa-changed": Record<string, never>` e na lista de eventos)
- Create: `app/api/sigaa/route.ts` (GET), `app/api/sigaa/conta/route.ts` (POST, DELETE), `app/api/sigaa/sincronizar/route.ts` (POST)
- Test: `tests/sigaa-sincronizar.test.ts`

**Interfaces:**
- Consumes: Tasks 3–7; `BibliotecaStore` (`readMateria`, `readTurma`, `readReferencias`, `writeMateria`, `writeTurma`, `writeReferencias`, `addReferenciaFile`).
- Produces:
  ```ts
  export interface SincronizacaoDeps {
    biblioteca: BibliotecaStore; sigaa: SigaaStore;
    cifrar: (t: string) => Promise<string>; decifrar: (c: string) => Promise<string>;
    novaSessao: () => SigaaSessao; agora: () => Date; emitir: () => void;   // emitir "sigaa-changed" e "biblioteca-changed"
  }
  export function createSincronizacao(deps: SincronizacaoDeps): {
    estado(): EstadoSigaa;
    conectar(usuario: string, senha: string): Promise<EstadoSigaa>;   // login; se ok, grava a conta e segue a leitura em segundo plano
    sincronizarAgora(): EstadoSigaa;   // inicia se não houver outra rodando; devolve o estado
    sair(): EstadoSigaa;
    /** Para os testes: a sincronização em andamento, se houver. */
    emAndamento(): Promise<void> | null;
  };
  export const sincronizacao: ReturnType<typeof createSincronizacao>;   // deps reais: SIGAA_BASE via baseDoSigaa(), esperarMs 800
  // rotas.ts
  export function sigaaEstadoRoute(s?): Response                    // GET /api/sigaa → EstadoSigaa
  export function sigaaConectarRoute(request: Request, s?): Promise<Response>   // POST /api/sigaa/conta {usuario, senha}
  export function sigaaSairRoute(s?): Response                      // DELETE /api/sigaa/conta
  export function sigaaSincronizarRoute(s?): Response               // POST /api/sigaa/sincronizar → 202
  ```
- Regras:
  - `conectar`: usuário ou senha vazios → 400 "Informe usuário e senha."; `SigaaSenhaRecusadaError` → 401 com a mensagem, **nada gravado**; sucesso → grava `{ usuario, senhaCifrada }`, estado `sincronizando`, e continua a leitura com a mesma sessão (um login só).
  - `sincronizarAgora` sem conta → estado `sem-conta` com aviso "Conecte sua conta UFJ primeiro."; com `senha-recusada` → não tenta (o aluno precisa conectar de novo); já rodando → devolve o estado sem abrir outra.
  - Uma sincronização: `decifrar` → `entrar` → `lerSigaa`, com `jaBaixado` olhando `sigaaId` nas referências da turma `idTurmaSigaa(semestre, sufixo)` → `sair`. Em `aoLerTurma`, tudo síncrono, **sem `await` entre ler e gravar** (Review Focus 5):
    1. `readMateria`, `readTurma(codigo, idTurmaSigaa(...))`, `readReferencias`;
    2. para cada arquivo baixado, `addReferenciaFile` e uma entrada `{ arquivo, sha256, sigaaId, titulo, topicos: [] }` (sem repetir `arquivo` já listado) somada às referências lidas;
    3. `montarDoSigaa(lida, { materia, turma, referencias }, agora)`;
    4. `writeMateria`, `writeTurma`, `writeReferencias`.
  - Estado final `ocioso` com `ultimoSucesso` e `avisos` = avisos das montagens + uma linha por falha de turma: `Não consegui ler {nome}: {erro}`.
  - `SigaaSenhaRecusadaError` → `senha-recusada`, erro "O SIGAA recusou a senha guardada. Conecte a conta de novo."; `SigaaIndisponivelError` → `erro` com a mensagem; nunca uma segunda tentativa de login.
  - Mensagens das rotas pelo padrão de `respostaDeErro`.

- [ ] **Step 1: Write the failing tests** — SIGAA falso das Tarefas 4–6, `LH_DATA_DIR` temporário, `cifrar`/`decifrar` falsos:
  - `it("conectar com senha certa grava a conta e monta as turmas")`: depois de `emAndamento()`, `bibliotecaStore.readTurma("ICE0001", "2026-2-turma-ta")` existe, há arquivos baixados e `estado().situacao === "ocioso"`.
  - `it("senha errada: 401, nada gravado, um POST de login")`.
  - `it("a segunda sincronização não baixa de novo")`: nenhum pedido de download na segunda.
  - `it("mesmo conteúdo com outro id reaproveita o arquivo")`: `addReferenciaFile` devolve `reutilizado: true` e não há arquivo duplicado na pasta.
  - `it("a data à mão de uma prova do SIGAA volta para a do SIGAA")`.
  - `it("edição durante a sincronização não se perde")` (Review Focus 5): o SIGAA falso, ao servir a página de Arquivos da 1ª turma (já gravada numa sincronização anterior), chama `adicionarProva` do serviço da biblioteca; depois da sincronização, a prova à mão continua na turma.
  - `it("sessão que cai vira aviso e mantém os dados anteriores da turma")` (Review Focus 1).
  - `it("sincronizarAgora com outra rodando não abre a segunda")`.
  - `it("rotas: GET devolve o estado; DELETE apaga a conta")`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-sincronizar.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** o serviço, as rotas, o evento e os três arquivos de `app/api/sigaa/`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): sincronização com conta, rotas e evento`

### Task 9: Rotas para mudar a data, adicionar prova e escolher o conteúdo

**Files:**
- Modify: `src/server/biblioteca.ts` (métodos `definirData`, `adicionarProva`, `definirEscopo`), `src/server/biblioteca-rotas.ts`
- Create: `app/api/biblioteca/materias/[codigo]/turmas/[turma]/avaliacoes/route.ts` (POST), `app/api/biblioteca/materias/[codigo]/turmas/[turma]/avaliacoes/[avaliacao]/route.ts` (PUT)
- Test: `tests/sigaa-provas-rotas.test.ts`

**Interfaces:**
- Consumes: Task 2 (`definirDataProva`, `adicionarProva`, `definirEscopoProva`).
- Produces:
  - `BibliotecaService.definirData(codigo, turmaId, avaliacaoId, data: string | null): Turma`, `.adicionarProva(codigo, turmaId, { nome, data? }): Turma`, `.definirEscopo(codigo, turmaId, avaliacaoId, topicos: string[]): Turma` — leem a turma, aplicam a função do core, gravam (`writeTurma` emite `biblioteca-changed`).
  - `provaPutRoute(request, codigo, turmaId, avaliacaoId, svc?)`: corpo `{ data?: string | null; topicos?: string[] }` (ao menos um) → 200 `Turma`.
  - `provaPostRoute(request, codigo, turmaId, svc?)`: corpo `{ nome: string; data?: string }` → 200 `Turma`.

- [ ] **Step 1: Write the failing tests**:
  - `it("PUT data grava e marca à mão")`; `it("PUT data null apaga")`; `it("PUT topicos grava as escolhas")`.
  - `it("PUT sem data nem topicos dá 400")`; `it("prova desconhecida dá 404 'Prova não encontrada.'")`; `it("data inválida dá 400 com a mensagem do core")`.
  - `it("POST cria a prova com o id do nome")`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-provas-rotas.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** o teste novo e `tests/biblioteca-routes.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(biblioteca): mudar a data, adicionar prova e escolher o conteúdo`

### Task 10: Tela Conta UFJ, cartão na tela Matérias e o nome "Matérias"

**Files:**
- Create: `components/sigaa/conta-ufj.tsx`, `app/conta-ufj/page.tsx`
- Modify: `components/biblioteca/biblioteca-home.tsx`, `components/sidebar.tsx` (`BibliotecaNavButton`), `app/biblioteca/page.tsx` (se o título vier dele)
- Test: `tests/sigaa-ui.test.tsx`; atualizar `tests/biblioteca-ui.test.tsx` e `tests/render-sidebar.test.tsx` onde esperam "Biblioteca"

**Interfaces:**
- Consumes: `EstadoSigaa` (Task 7, pelo barril do core); rotas da Task 8.
- Produces:
  - `ContaUfj({ estado, ocupado, erro, onConectar, onSincronizar, onSair }: { estado: EstadoSigaa; ocupado: boolean; erro: string | null; onConectar(usuario: string, senha: string): void; onSincronizar(): void; onSair(): void })` (puro) e `ContaUfjScreen()` (busca `/api/sigaa`, escuta `sigaa-changed`).
  - `CartaoSigaa({ estado }: { estado: EstadoSigaa })` no topo de `BibliotecaHome` (nova prop `estado?: EstadoSigaa`).
- Textos exatos:
  - Formulário: "Conta UFJ (SIGAA)", rótulos "Usuário do Login Único" e "Senha", botão "Entrar". A senha usa `type="password"` e `autoComplete="current-password"`; o campo é limpo depois de enviar.
  - Conectado: "Conectado como {usuario}", "Última sincronização: {dd/mm/aaaa, hh:mm}", botões "Sincronizar agora" e "Sair da conta". Sincronizando: "Sincronizando com o SIGAA…" e o botão desabilitado.
  - Senha recusada: "O SIGAA recusou a senha guardada. Conecte a conta de novo." com o formulário.
  - Cartão sem conta: "Conecte sua conta UFJ para montar as matérias pelo SIGAA." com link para `/conta-ufj`.
  - Cartão com conta: situação, "Última sincronização: …", botão "Sincronizar agora" e cada linha de `estado.avisos` num `Aviso`. Com `senha-recusada`, o cartão mostra "O SIGAA recusou a senha guardada. Conecte a conta de novo." com link para `/conta-ufj`.
  - Barra lateral e título da página: "Matérias". O texto de apoio da home: "As matérias do semestre, as provas e a preparação de cada uma."; a lista vazia: "Nenhuma matéria ainda. Conecte sua conta UFJ ou importe um plano de ensino."

- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup`, como `tests/biblioteca-ui.test.tsx`):
  - `it("sem conta mostra o formulário com campo de senha")`: `type="password"`, "Entrar".
  - `it("conectado mostra usuário, última sincronização e os botões")`.
  - `it("sincronizando desabilita o botão")`.
  - `it("senha recusada mostra o aviso e o formulário")`.
  - `it("a home mostra o cartão sem conta com link para /conta-ufj")`.
  - `it("o cartão mostra os avisos da última sincronização e a senha recusada")`.
  - `it("a barra lateral diz Matérias")`.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-ui.test.tsx tests/biblioteca-ui.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): tela Conta UFJ e matérias montadas pelo SIGAA na home`

### Task 11: Turma do SIGAA na tela: provas com data editável, conteúdo da prova e tópicos de aula

**Files:**
- Create: `components/biblioteca/data-editavel.tsx`, `components/biblioteca/provas-sigaa.tsx`, `components/biblioteca/topicos-de-aula.tsx`
- Modify: `components/biblioteca/turma-view.tsx`, `components/biblioteca/preparacao-view.tsx`, `src/core/ufj-context.ts` (linha da disciplina sem curso e sem docente)
- Test: `tests/sigaa-turma-ui.test.tsx`; acrescentar o caso novo em `tests/ufj-context.test.ts`

**Interfaces:**
- Consumes: rotas da Task 9; `Turma.sigaa`, `Avaliacao.origemData`, `Aula.sigaa`, `Referencias` (Task 1).
- Produces:
  - `DataEditavel({ data, origem, onSalvar, editandoInicial }: { data?: string; origem?: Avaliacao["origemData"]; onSalvar(data: string | null): void; editandoInicial?: boolean })`: mostra a data (ou "sem data") como botão; ao clicar, `input type="date"`; Enter ou sair do campo salva; Esc cancela; "Limpar" envia `null`. Selo: `sigaa` → "do SIGAA", `manual` → "à mão", `plano` → "do plano". Com `origem === "sigaa"`, abaixo do campo: "A próxima sincronização com o SIGAA troca esta data."
  - `ProvasSigaa({ materia, turma, hoje, onData, onAdicionar, onEscopo })`: linha por prova (nome, `DataEditavel`, dias, "Preparar"), "Adicionar prova" (nome e data), e por prova um "Conteúdo da prova" que abre a lista de tópicos de estudo ativos com caixas marcadas pelo escopo (salva com `onEscopo(avaliacaoId, topicos)`).
  - `TopicosDeAula({ turma, referencias })`: linha do tempo com data, `aula.sigaa.titulo` e os títulos dos arquivos ligados (`referencias.arquivos` com `aula === ordem`); aula cancelada esmaecida com "não houve aula"; aula de prova marcada "prova".
  - Em `TurmaView`: com `turma.sigaa`, usa `ProvasSigaa` e `TopicosDeAula` e **esconde** "Editar plano"; sem `turma.sigaa`, fica como hoje.
  - Em `PreparacaoTela`: o cabeçalho usa `DataEditavel` (salva pela rota da Task 9 e recarrega a view).
  - `composeUfjContextText`: com `curso` vazio e `docente.nome` vazio, a linha fica exatamente `Disciplina: ICE0001 Disciplina Teste, UFJ. Semestre: 2026-2.`; com os dois preenchidos, fica como hoje.

- [ ] **Step 1: Write the failing tests**:
  - `it("selo e aviso da data do SIGAA")`: `origem: "sigaa"` mostra "do SIGAA"; ao renderizar no modo de edição (prop `editandoInicial` para o teste), aparece "A próxima sincronização com o SIGAA troca esta data.".
  - `it("turma do SIGAA esconde Editar plano e mostra tópicos de aula com arquivos")`.
  - `it("aula cancelada aparece esmaecida com 'não houve aula'")`.
  - `it("conteúdo da prova marca as caixas do escopo")`: `data-escopo="sigaa-999:regra-da-cadeia"` com `checked`.
  - `it("turma de plano continua com Editar plano")`.
  - `it("linha da disciplina sem curso e sem docente")` no teste de `composeUfjContextText`, com o texto exato acima.
- [ ] **Step 2: Run** `NODE_ENV=test npx tsx --test tests/sigaa-turma-ui.test.tsx` e o teste do contexto — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sigaa): provas com data editável, conteúdo da prova e tópicos de aula`

### Task 12: Verificação completa e ponto de checagem com o dono

**Files:**
- Modify: nenhum código novo, salvo correções que a verificação achar.

- [ ] **Step 1: Run** `rm -f tsconfig.tsbuildinfo && npm run typecheck` — Expected: sem erros.
- [ ] **Step 2: Run** `npm run lint` — Expected: 0 erros (o aviso antigo pode continuar).
- [ ] **Step 3: Run** `npm test` — Expected: todos passam, 0 falhas.
- [ ] **Step 4: Ver no navegador com o SIGAA falso.** Criar `scripts/sigaa-falso-dev.ts` (só para desenvolvimento; sobe `iniciarSigaaFalso` numa porta fixa, 4877, com senha `teste`) e acrescentar `LH_SIGAA_BASE_URL=http://127.0.0.1:4877` e `LH_SIGAA_SENHA_DEV=1` à configuração `ufj-dev` de `.claude/launch.json` (dados isolados). Conferir: conectar com `aluno.teste`; a matéria "Disciplina Teste" aparece; mudar a data de uma prova à mão; abrir "Conteúdo da prova"; abrir a preparação e clicar em Aprender (o cartão UFJ aparece e o contexto lista o arquivo do tópico). Sem erros no console.
- [ ] **Step 5: Gerar o app de desktop** com `npm run desktop:local` e conferir que o app abre.
- [ ] **Step 6: Ponto de checagem com o dono (spec §7.10).** O dono abre o app, vai em Conta UFJ, entra com a própria conta e espera a sincronização. Ele conta o que apareceu e o que faltou nas 4 matérias. Se algo faltar, ler as páginas reais da pasta de diagnóstico para corrigir o leitor, com nova página de exemplo inventada e teste antes da correção.
- [ ] **Step 7: Commit** das correções, se houver, e conferir o diff inteiro do branch contra nomes reais antes de abrir o PR.
