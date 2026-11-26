# O chat como lugar de estudo, com o SIGAA à mão (design)

Data: 25/11/2026. Branch: `ufj/sigaa` (continua a fatia 1 do SIGAA, PR #2).
Complementa `2026-11-24-ufj-sigaa-design.md`; onde os dois divergirem, vale este.

## 1. Intenção e porquê

Hoje a IA só enxerga o SIGAA quando a sessão nasce da tela de Preparação, num
tópico. Numa conversa comum ("me ajuda a revisar para a última prova de
Cálculo") ela não sabe que existem matérias, provas, tarefas nem arquivos do
professor, e responde que não achou material. O dono quer o contrário: **o chat
é o mecanismo principal de estudo**, e a IA conhece o semestre do aluno em
qualquer conversa, com todas as ferramentas que tem para explicar, exemplificar
e demonstrar o material, conforme a necessidade de cada momento.

A aba de materiais passa a servir para **abrir e ler o arquivo dentro do app**,
e dela o aluno pode puxar um chat focado naquele material. Nada de visualizador
especial, interpretador de Python ou geração de imagem agora: o básico bem
feito.

Sucesso: o aluno abre um chat, escreve "revisão para a N3 de Cálculo I" e a IA
monta a revisão com os slides e as listas do professor, sabendo a data da prova
e o que cai; ou abre um slide pela aba de materiais e, num clique, está num chat
com a IA lendo aquele slide.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
1. Em todo chat (aula, prática, conversa lateral), a IA sabe as matérias, as
   próximas provas e tarefas com datas, e consegue achar os tópicos, os
   arquivos do professor e os avisos quando precisa.
2. A sincronização passa a trazer as **tarefas** (título, prazo, instruções) e
   as **notícias** (título, data, texto) de cada turma.
3. A aba de materiais abre o arquivo dentro do app (PDF, texto, código,
   cadernos convertidos, imagens) e tem o botão "Estudar com a IA".
4. Interface enxuta: cada tela mostra só o que o aluno usa para estudar.

**Não-objetivos**
- Visualizador com anotações, busca ou seleção de trecho; Python no app;
  geração de imagem; tela de agenda própria (o resumo no chat faz esse papel
  por enquanto); escrever no SIGAA.
- Mudar o jeito de ensinar das aulas e práticas.

**Anti-objetivos**
- Colar a biblioteca inteira em cada chat (custo e ruído por mensagem).
- A IA afirmar que leu um arquivo que não leu.
- Texto em inglês novo; dados reais do dono no repositório.

## 3. Restrições

- Arquitetura do repositório: core não importa server/store; `components/` só
  importa o barril do core; rotas só exportam métodos HTTP.
- Os prompts são compostos por fragmentos em `src/agent/prompts/**`;
  `PRACTICE_SHARED_FRAGMENTS` e `SIDE_SHARED_FRAGMENTS` escolhem quais entram.
- Ferramentas do agente seguem o padrão de `src/agent/tools/ls.ts` (TypeBox +
  `serverExecute`), são registradas em `src/agent/tools.ts` e respeitam a
  política de acesso a arquivos (a pasta da biblioteca já é liberada).
- O leitor do SIGAA abre cada seção a partir da página principal da turma; as
  páginas reais de Tarefas e Notícias estão na pasta de diagnóstico do dono
  (fora do repositório) para modelar as páginas de exemplo inventadas.
- O app de desktop é um Chromium: abre PDF nativamente num `iframe`.

## 4. Abordagens consideradas

**Como a IA recebe os dados (decidido: resumo + ferramenta).**
- *Resumo + ferramenta*: um resumo curto no prompt de todo chat (matérias,
  próximas provas e tarefas) e uma ferramenta para os detalhes. Escolhido: a IA
  sabe do semestre sem o aluno explicar, e o prompt fica pequeno.
- *Só ferramenta*: mais simples, mas a IA às vezes não procura.
- *Tudo no prompt*: descartado pelo custo por mensagem.

**Onde o estudo do material acontece (decidido: no chat).** A alternativa de
uma tela do material com a IA ao lado foi descartada pelo dono como
complicação desnecessária.

## 5. Design

### 5.1 Sincronização: tarefas e notícias

`SECOES_LIDAS` ganha "Tarefas" e "Notícias". Novos leitores em
`src/server/sigaa/`:

- **Tarefas** (`ler-tarefas.ts`): a listagem vem em pares de linhas; a primeira
  tem título (negrito, `td.first`), período "de dd/mm/aaaa às HHhMM a dd/mm/aaaa
  às HHhMM", se tem nota, envios e o comando "Enviar tarefa"; a segunda tem as
  instruções e, às vezes, "Baixar arquivo". Sai
  `{ titulo, inicio, fim (AAAA-MM-DD), hora?, instrucoes, temArquivo }`.
- **Notícias** (`ler-noticias.ts`): tabela com título, data e o comando
  "Visualizar" com o `id`. O texto completo é lido com um clique a mais, **só
  das notícias que o app ainda não tem** (pelo `id`), a partir da página da
  lista. Sai `{ sigaaId, titulo, data, texto? }`.

Os dados entram em `Turma` como campos opcionais:
`tarefas: { titulo, inicio?, fim?, instrucoes, temArquivo }[]` e
`noticias: { sigaaId, titulo, data, texto? }[]` (formato continua 1). A
montagem substitui as listas pelo que o SIGAA mostrou, preservando o `texto`
de notícias já lidas. Progresso: a barra ganha "lendo tarefas", "lendo
notícias".

### 5.2 O resumo no prompt

Um fragmento **gerado na hora** (não é arquivo `.md` fixo) entra em todo
system prompt, logo após `12-contexto-ufj.md`, quando a biblioteca tem ao
menos uma turma. Texto exato (datas em dd/mm; "hoje" é a data local):

```
[Semestre UFJ — 25/11/2026]
Matérias: ICE0001 Cálculo Teste (2026-2); ICE0002 Disciplina Teste II (2026-2).
Próximas provas: 27/11 Disciplina Teste II — 3ª prova (em 2 dias); 03/12 Cálculo Teste — 2ª unidade (em 8 dias).
Próximas tarefas: 26/11 23:59 Cálculo Teste — Lista 3; 02/12 Disciplina Teste II — Trabalho 1.
Para tópicos, arquivos do professor, instruções de tarefas e avisos, use a ferramenta `ufj`. Leia os arquivos pelo caminho que ela devolve.
```

Regras: provas e tarefas dos próximos 21 dias, mais a próxima de cada matéria
quando não houver nenhuma nesse prazo; no máximo 12 linhas; sem o texto de
notícias. Sem biblioteca, o fragmento não entra. A conversa lateral recebe o
mesmo fragmento (ela responde dúvidas sobre o material).

`12-contexto-ufj.md` ganha um parágrafo: o resumo existe em todo chat; quando o
aluno citar uma matéria, prova, tarefa ou "o material", consultar `ufj` e ler
os arquivos antes de responder; nunca dizer que não há material sem ter
consultado.

### 5.3 A ferramenta `ufj`

Uma ferramenta só, com `acao`:

- `materias` → código, nome, semestre, docente, provas (nome, data, origem) de
  cada turma. Igual ao resumo, completo.
- `materia` (`codigo`) → tópicos de estudo (id, título, aulas com data),
  provas com escopo (ids dos tópicos), tarefas (título, prazo, instruções),
  notícias (título, data; `sigaaId`), arquivos (título, nome, **caminho
  absoluto**, tópico de aula). É o que a IA usa para montar uma revisão.
- `noticia` (`codigo`, `sigaaId`) → o texto completo.

Saída em texto compacto (uma linha por item), limitada pelo mesmo
`MAX_OUTPUT_BYTES` das outras ferramentas. Só leitura; nada de rede. Entra na
**sonda** (`createProberTools`), no professor (`createTeacherTools`) e na
prática: o caso "revisão para a N3" começa na sonda, que precisa achar o escopo
e os arquivos antes do `probe_done`. A conversa lateral **não** ganha
ferramentas (ela é um fluxo sem laço de ferramentas, e PDFs só são lidos por
trabalho em segundo plano): ela recebe o resumo e, quando a sessão tem o
marcador UFJ, a lista de arquivos já está na transcrição que ela lê.

Os caminhos devolvidos apontam para a pasta da biblioteca, que a política de
acesso já libera mesmo no modo restrito. A leitura continua como hoje: `read`
para texto, código e cadernos convertidos; PDFs pelo trabalho `pdf` (a maioria
dos materiais é PDF, então a IA deve despachar a leitura cedo e seguir
ensinando, na disciplina assíncrona que já existe).

**Duas turmas na mesma matéria** (uma de plano importado e uma do SIGAA): o
resumo e `ufj materias` mostram a turma do SIGAA; a outra aparece só em
`ufj materias`, marcada "(plano importado)". A data do SIGAA vence, como
decidido antes.

### 5.4 Chat a partir de um material e da prova

- **"Estudar com a IA"** num arquivo abre um chat (aula) cujo marcador
  `ufj-context` traz a matéria, a turma, o tópico do arquivo (se houver) e
  **aquele arquivo em primeiro lugar** nos materiais; sem avaliação
  obrigatória (o campo `avaliacao` passa a ser opcional no marcador e no
  texto do contexto). Mensagem pré-preenchida:
  `Quero estudar o material "Lista de regra da cadeia" de Cálculo Teste.`
- **"Revisar para a prova"** na Preparação abre um chat com o marcador da
  prova inteira: todos os tópicos do escopo e todos os arquivos deles.
  Mensagem: `Quero revisar para a 2ª unidade de Cálculo Teste (03/12).`
- Os dois chats são sessões comuns do harness (sonda, plano, aula), que é o
  que o dono quer manter; o contexto só delimita o alvo.
- O vínculo ganha `origem: "topico" | "material" | "prova"`. **Só chats de
  origem `topico` contam** para os selos "aula feita"/"praticado" e para as
  horas; um chat de um slide ou de revisão não marca o tópico como dado. Na
  Preparação, esses chats aparecem na lista do tópico (ou da prova) como
  "Material: …" e "Revisão". O cartão de contexto mostra só o que o vínculo
  tem (sem avaliação, não mostra avaliação).

### 5.5 Aba de materiais

A página da matéria (`/biblioteca/[codigo]/[turma]`) passa a ter a seção
**Materiais** como lista enxuta agrupada por tópico de aula, na ordem do
cronograma:

```
Materiais
  04/09  Regra da cadeia
         Lista de regra da cadeia · PDF        [Abrir] [Estudar com a IA]
         Exemplos · caderno                    [Abrir] [Estudar com a IA]
  01/09  Limites
         Aula 1 - Limites · PDF                [Abrir] [Estudar com a IA]
  Sem tópico
         Ficha de avaliação · Word             [Baixar]
```

- **Abrir** leva a `/biblioteca/[codigo]/[turma]/arquivo/[nome]`: PDF em
  `iframe` (rota `GET /api/biblioteca/materias/[codigo]/turmas/[turma]/arquivos/[nome]`
  servindo o arquivo com o tipo certo e `Content-Disposition: inline`);
  `.md`, `.txt` e cadernos convertidos como Markdown renderizado; código como
  bloco com realce; imagens direto. Formatos que o navegador não abre
  (`.docx`, `.odt`, `.zip`) só têm **Baixar**.
- A página do arquivo tem o título, o tópico, o botão "Estudar com a IA" e o
  conteúdo. Nada mais.
- O formulário de "mapear materiais a tópicos" da fatia 1 some das turmas do
  SIGAA (o professor já pendura cada arquivo no tópico) e fica só para turmas
  de plano importado. O envio de arquivos extras continua, como um botão
  "Adicionar arquivo" discreto no fim da lista, que pede o tópico de aula num
  seletor (sem modelo), para o arquivo não ficar órfão.
- **PDF no `iframe`**: conferir cedo no app empacotado se o Chromium do
  Electron abre PDF (pode exigir `plugins: true` nas `webPreferences`). Se não
  abrir, a página renderiza as páginas do PDF como imagens com o `pdfjs-dist`
  que o app já usa, uma por vez, com "anterior/próxima".

### 5.6 Interface enxuta

Regras para todas as telas da UFJ, aplicadas nesta entrega:

- Uma frase de apoio por tela, no máximo; nenhuma explicação do que o app faz
  em telas que o aluno já usa (a de Conta UFJ mantém a frase da senha).
- Códigos de disciplina, ids internos, "formato", "importadoEm" e afins nunca
  aparecem. O código da matéria só na página da matéria, pequeno.
- Avisos da sincronização: só na Conta UFJ e no cartão de Matérias, e somem
  quando a próxima sincronização dá certo.
- Lista de provas: nome, data editável, dias, selo de origem, "Preparar".
  "Conteúdo da prova" fica fechado por padrão (já está).
- Preparação: cabeçalho, horas, próximo passo, tópicos. A linha "Aula 4 (04/09)
  · 2 material(is)" vira "04/09 · 2 materiais".
- Tópicos de aula: a linha do tempo mostra só data e título; os arquivos
  aparecem na seção Materiais (não duplicar).
- Textos de botão com no máximo três palavras; sem reticências em botões.

### 5.7 Onde mexer no código

- `src/server/sigaa/`: `ler-tarefas.ts`, `ler-noticias.ts`, `navegar.ts`
  (seções e texto de notícias novas), `sincronizar.ts`.
- `src/core/biblioteca.ts` (campos `tarefas`, `noticias`), `src/core/sigaa.ts`
  (montagem), `src/core/ufj-context.ts` (avaliação opcional; arquivo em
  destaque), `src/core/contracts/chat.ts` (`UfjContextRef.avaliacao?`,
  `arquivo?`).
- `src/core/resumo-ufj.ts` (puro: monta o texto do resumo a partir das turmas
  e de "hoje") e `src/agent/prompt-segments.ts` (fragmento gerado).
- `src/agent/tools/ufj.ts` e `src/agent/tools.ts`; `src/agent/side-chat.ts`.
- `src/server/preparacao.ts` (marcador de prova inteira e de material),
  `app/api/chats/route.ts` (aceitar os novos vínculos).
- Rotas: arquivo inline; página `/biblioteca/[codigo]/[turma]/arquivo/[nome]`.
- Componentes: `materiais-lista.tsx`, `arquivo-view.tsx`, ajustes em
  `turma-view.tsx`, `preparacao-view.tsx`, `topicos-de-aula.tsx`,
  `provas-sigaa.tsx`, `biblioteca-home.tsx`, `conta-ufj.tsx`.
- Testes: leitores com páginas de exemplo novas (`turma-tarefas.html`,
  `turma-noticias.html`, `turma-noticia.html`), SIGAA falso servindo as
  seções, resumo (texto exato), ferramenta `ufj`, rota do arquivo (tipo,
  inline, nome fora da pasta recusado), telas.

## 6. Ordem de entrega

1. Tarefas e notícias na sincronização (leitores + montagem + barra).
2. Resumo no prompt + ferramenta `ufj` + fragmento ajustado (o caso do dono).
3. Aba de materiais: lista enxuta, abrir no app, "Estudar com a IA",
   "Revisar para a prova".
4. Interface enxuta nas telas restantes.

## 7. Decisões minhas (o dono deve conferir)

1. Resumo limitado a 21 dias e 12 linhas; sem texto de notícias no prompt.
2. A conversa lateral não ganha ferramentas; recebe o resumo e a lista de
   arquivos que já está na transcrição. A sonda, sim, ganha a ferramenta `ufj`.
3. O texto das notícias é lido só para as novas, para a sincronização não
   crescer com o semestre.
4. Tarefas sem `sigaaId` legível são identificadas pelo título + prazo.
5. "Estudar com a IA" abre uma **aula** (não prática), com a sonda e o plano
   de sempre; o contexto delimita o alvo ao material.
6. O formulário de mapear materiais some das turmas do SIGAA.
7. Formatos que o Chromium não abre só têm "Baixar"; nenhuma conversão nova.
8. Só chats de origem `topico` contam nos selos e nas horas da Preparação.
9. Com turma de plano e turma do SIGAA na mesma matéria, a IA vê a do SIGAA.
10. O envio de arquivo extra pede o tópico num seletor.

## 8. Fora desta entrega

Python interativo, geração de imagens, tela de agenda, sugestões de data por
notícia (fatia 3; as notícias agora ficam guardadas, o que facilita), pendências
pequenas do revisor da fatia 1, fatia 1.5 (traduzir o resto do app).
