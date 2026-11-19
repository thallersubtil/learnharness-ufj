# Plataforma de estudos UFJ — Etapa A (design)

*Data: 2026-11-18 · Repositório: `thallersubtil/learnharness-ufj` (projeto próprio, derivado do LearnHarness v0.6.1, AGPL-3.0) · Branch: `ufj/etapa-a`*

## 1. Intenção e porquê

O dono é aluno do Bacharelado em Inteligência Artificial da UFJ (ICET, 2º período, 2026/2). Ele quer transformar o LearnHarness numa plataforma para estudar **para as provas** das matérias do semestre e, depois, liberá-la para os colegas.

Ele gosta de como o harness ensina e **a ideia geral não pode mudar**:

- sondar onde termina o entendimento;
- planejar a árvore mínima até o objetivo;
- ensinar um passo de raciocínio por vez, com checagem depois de cada passo;
- praticar em sessões separadas;
- acumular um grafo de conhecimento.

A metodologia está em [`docs/teaching-methodology.md`](../../teaching-methodology.md) e nas doutrinas em `src/agent/prompts/`.

O que falta ao harness para servir a provas de uma universidade:

1. **O plano de ensino como referência de cada matéria.** O plano traz ementa, cronograma aula a aula com datas, avaliações e bibliografia. Sem escopo de prova, ferramentas desse tipo viram chat genérico.
2. **Conteúdo separado em preparações por prova.** "O que cai na AV3" vem do cronograma.
3. **Provas reais e simuladas:**
   - a **prova real** é uma prova antiga do professor, enviada para a biblioteca;
   - a **prova simulada** é uma prova inédita gerada pela IA no estilo das provas antigas daquele professor e no escopo do plano.
4. **Uma biblioteca** de planos, referências (slides) e prompts prontos, para que estudar uma matéria comece rápido.

Os kits de estudo que o dono montou à mão este semestre mostram o que ele valoriza:

- `calculo1-prova1/estudo-prova1.html`, `POO-Prova1/kit-prova1-poo.html` e `Material_de_Estudo_AV1_Estrutura_de_Dados.md`;
- "o que a prova cobrou" e "a prova resolvida do jeito que o professor quer ver";
- simulado da nova prova por blocos de conteúdo;
- teste de mesa e "pegadinhas";
- alinhamento com os slides e o estilo do professor;
- roteiro com tempo fechado ("em 6 horas").

**Urgência:** as próximas provas do dono são a AV3 de Estrutura de Dados (27/11), a AV2 de Arquitetura (01/12), a Prova 2 de POO (por volta de 07/12) e a N3 de Cálculo I (08/12). A Etapa A deve virar algo que ele use nessas provas.

## 2. O projeto em duas etapas

| Etapa | Conteúdo | Para quem |
|---|---|---|
| **A (este documento)** | Biblioteca local e importação do plano; preparação por avaliação; aprender e praticar por tópico; prova real e simulada com correção e análise de erros; a IA sempre em português | O dono, no próprio computador |
| B (design futuro) | Login com GitHub numa organização privada e sincronização da biblioteca; envio de material pelos colegas com aprovação do dono; tradução completa da interface; instaladores para Windows, Mac e Linux com atualização automática; página de download | Os colegas |

A Etapa A não implementa nada da B, mas **não pode fechar as portas dela** (seção 9).

### 2.1 Entregas dentro da Etapa A

Esta divisão é decisão minha, para que cada parte já sirva a uma prova próxima. As datas são metas, não promessas.

| Fatia | Conteúdo | Meta |
|---|---|---|
| **1** | Identidade própria do app (7.14); biblioteca; importar plano de ensino; materiais; tela de preparação; Aprender e Praticar com contexto UFJ; IA em português | antes da AV3 de ED (27/11) |
| **1.5** | Tradução fiel para o português de todo o texto que o modelo lê: prompts, instruções dos workers e descrições de ferramentas (7.12) | logo depois da fatia 1 |
| **2** | Sessão do tipo Prova; gerar simulado; correção; relatório; caderno de erros. O compositor aceita **fotos de provas antigas como molde de estilo** sem importá-las (7.9) | antes da AV2 de AC (01/12) |
| **3** | Importar prova real, **começando pelas fotos do celular** (caminho por visão); gabarito com verificação; perfil do professor; simulado no molde do perfil | antes de POO e Cálculo (07–08/12) e da substitutiva de ED |

Por que nessa ordem: o dono só tem provas antigas de Estrutura de Dados, todas em foto do celular (seção 10). Então o simulado (fatia 2) serve às quatro matérias. A importação completa de prova real (fatia 3) serve sobretudo a ED. Para que a ED não espere a fatia 3, o compositor da fatia 2 já consegue ler as fotos como exemplo de estilo.

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos da Etapa A**

1. Importar um plano de ensino em PDF para uma matéria estruturada, **sempre revisada pelo dono antes de salvar**.
2. Anexar referências (slides, notebooks, listas) a uma turma e ligá-las aos tópicos.
3. Ter uma tela de **preparação por avaliação**, com:
   - contagem regressiva;
   - os tópicos do escopo;
   - próximos passos sugeridos;
   - provas reais e simulados disponíveis;
   - o caderno de erros.
4. **Aprender** ou **Praticar** um tópico, abrindo uma sessão nativa de Ensinar ou Praticar já ligada ao tópico, com contexto e referências.
5. Importar uma **prova real** (PDF ou fotos) para questões estruturadas, com gabarito do professor ou gerado e verificado pela IA, revisada antes de salvar.
6. Gerar uma **prova simulada** no escopo da avaliação e no estilo do **perfil do professor**.
7. Fazer qualquer prova, real ou simulada, numa **sessão do tipo Prova**. A sessão é o terceiro tipo, ao lado de Ensinar e Praticar. Funciona assim:
   - em condições de prova, com cronômetro, sem dicas e com entrega única;
   - correção com nota na escala do professor;
   - análise de erros que encaminha cada erro para Praticar ou Aprender.
8. Fazer toda a fala da IA em **português do Brasil**: aulas, checagens, problemas, veredictos, correções, perguntas laterais e as proposições do grafo.

**Não-objetivos da Etapa A** (podem vir depois)

- Login, compartilhamento, envios e sincronização com o GitHub (são da Etapa B).
- Traduzir as telas que já existem no núcleo (Etapa B). Na Etapa A, só as telas novas ficam em português.
- Instaladores, assinatura do app e página de download (Etapa B).
- Trabalhos, apresentações e listas como objeto de preparação. Eles aparecem no plano, mas só provas ganham preparação.
- Repetição espaçada com agenda (1, 3, 7, 16 e 35 dias). A Etapa A tem só o caderno de erros.
- Executar código para corrigir questões de programação. A correção é por critérios.
- Responder às questões da prova com foto ou desenho da resolução no papel. Na Etapa A é só texto (seção 10).
- Importar do SIGAA, Moodle ou `.ics`, e OCR próprio além do modelo com visão.
- Celular.

**Anti-objetivos** (se acontecer, falhou, mesmo funcionando)

- **Mudar como o harness ensina.** As doutrinas do prober, do teacher e da prática não mudam de método. Só ganham um fragmento sobre idioma e outro sobre como usar o contexto UFJ (seção 7.12).
- **Vazar gabarito antes da entrega.** Solução, critérios e alternativa correta não chegam ao navegador nem ao assistente de perguntas laterais antes da entrega.
- **Apresentar a nota da IA como verdade.** Toda correção feita pela IA mostra a confiança e pode ser contestada.
- **Inventar "o que mais cai".** A incidência por tópico só existe se vier de provas reais. Sem dados, mostrar "sem dado".
- **Salvar extração de PDF sem revisão humana.**
- **Dar dica, consulta ou atalho para o assistente durante uma prova.**
- **Criar "nota de domínio" no grafo.** O grafo continua guardando ideias, não avaliações do aluno. Notas existem só dentro das sessões de prova.

## 4. Restrições

- **App local de um usuário.** É Next.js mais Electron, com armazenamento em arquivos JSON sob `LH_DATA_DIR` e um processo por perfil de dados (ver [`docs/architecture.md`](../../architecture.md)). A Etapa A não muda isso.
- **Cada um usa a própria chave.** As chaves continuam como hoje (Settings → Providers). Já há suporte a Gemini, OpenRouter, Groq, DeepSeek, OpenAI, Anthropic e às assinaturas.
- **Fork divergente.** O dono escolheu traduzir tudo na Etapa B, então não vamos mais incorporar o código original. Mexer no núcleo é aceitável. O remoto `original` existe só para leitura, com envio desabilitado.
- **Licença AGPL-3.0:** manter `LICENSE` e o crédito ao autor original.
- **Convenções do repositório:**
  - testes com `tsx --test` e provedores falsos (`npm test`);
  - `npm run typecheck` e `npm run lint`;
  - regras de importação do ESLint entre `src/core`, `src/server`, `src/agent` e `src/store`;
  - o aviso do `AGENTS.md` de que esta versão do Next.js difere do conhecido: ler `node_modules/next/dist/docs/` antes de escrever rotas e páginas.
- **Empacotamento:** prompts novos precisam entrar no build standalone (`scripts/build-server.mjs`).

## 5. Abordagens consideradas

### 5.1 Como os colegas acessam (decidido: híbrido)

| Opção | Troca |
|---|---|
| **Híbrido (escolhido):** app de desktop para estudar, mais biblioteca restrita | Sem custo de servidor e sem guardar chave de ninguém. Mantém PDFs, arquivos locais e login de assinatura. Exige instalar e não roda no celular. |
| Só app de desktop | Menos trabalho, mas sem vitrine. |
| Site hospedado para vários usuários | Um link só e funciona no celular. Porém exige reescrever o armazenamento, criar contas e pagar servidor, e o dono passaria a guardar as chaves dos colegas. A leitura de arquivos do servidor seria um risco. |

Depois o dono decidiu que **tudo é restrito**: a biblioteca inteira fica para convidados, com conta GitHub numa organização privada. O site vira só uma página de download. Os colegas **enviam** material e **o dono aprova**. Tudo isso é Etapa B.

### 5.2 Como construir a Etapa A (decidido: nativo no núcleo)

| Opção | Troca |
|---|---|
| **Nativo no núcleo (escolhido)** | Biblioteca, preparação e provas viram partes do app, e a Prova é um `ChatKind` próprio. Herda das sessões a persistência, a recuperação, o custo e a barra lateral. Mexe em muitos arquivos do núcleo, o que custa pouco porque o fork já diverge. |
| Plugin mais o mínimo no núcleo | A API de plugins não cria sessões nativas (`app.openSession` só navega), não tem tipos de sessão novos nem gravação programável nos dados do núcleo. A prova ficaria numa conversa gerenciada, fora das sessões. |
| Prova como prática em "modo prova" | Menos código, mas contradiz a doutrina da prática: um problema por vez, pausa entre problemas e, literalmente, "Not an exam". Também não mostra a prova inteira. |

### 5.3 O que é prova real e o que é simulada (decidido)

- **Real:** prova antiga do professor.
- **Simulada:** prova inédita gerada pela IA.

As duas são feitas do mesmo jeito, em condições de prova. É decisão minha (seção 8). O treino com dicas continua sendo a Prática, para onde a análise de erros encaminha cada erro.

## 6. Dados reais que guiam o design

Os quatro planos lidos (Cálculo I ICE0784, Estrutura de Dados I ICE0643, POO ICE0658 e Arquitetura de Computadores ICE0618) seguem o mesmo modelo da UFJ. As seções são:

- I. Identificação (unidade, curso, disciplina, código, carga horária, docente, turma)
- II. Ementa
- III. Objetivos (geral e específicos)
- IV. Conteúdo programático e cronograma: tabela aula, data, CH, conteúdo e atividades avaliativas, e estratégias
- V. Metodologia
- VI. Atividades supervisionadas
- VII. Critérios de avaliação
- VIII. Recuperação
- IX. Referências (básica, complementar e virtual)

**As avaliações variam por professor**, então o modelo tem de ser genérico:

- Cálculo: N1, N2 e N3. Cada uma é prova escrita com peso 0,9 mais listas com peso 0,1, e a média é M = (N1 + N2 + N3)/3. Há recuperação com prova escrita (0,6) e oral (0,4).
- ED: AV1, AV2 e AV3, de 10 pontos cada, mais a substitutiva AVs, que troca a menor nota, e trabalhos (TR).
- AC: AV1 e AV2, mais AVs e uma apresentação.
- POO: PP1 e PP2, provas práticas em laboratório (30% cada), mais trabalho final (30%), listas e substitutiva prática.

**O escopo de uma prova sai do cronograma:** são as aulas depois da avaliação anterior até esta. Exemplo: a N3 de Cálculo (08/12) cobre as aulas 41 a 58, de extremos de funções até a fórmula de Taylor. A substitutiva e a recuperação cobrem tudo.

O texto sai bem do PDF (o plano de Cálculo, por exemplo, extrai limpo com `pypdf`). Alguns PDFs perdem espaços (o de POO sai como "UnidadeAcadêmica:Instituto…"), mas o modelo lida com isso.

**Os slides seguem a numeração da sequência de slides, não a das aulas.** Por exemplo, `4_-_Implementao_de_pilha_com_vetor.pdf`. Por isso o vínculo de cada slide com um tópico precisa de sugestão e revisão.

## 7. Design

### 7.1 Visão geral

```
Biblioteca (novo item na barra lateral)
  └ Matéria (ICE0784 Cálculo I)
      └ Turma 2026/2 · Prof. Exemplo [Plano de ensino] [Materiais] [Provas antigas]
          └ Avaliação N3 · 08/12 · faltam 20 dias      ← tela de PREPARAÇÃO
              ├ Próximos passos (sugeridos)
              ├ Tópicos: Extremos · TVM · Monotonia · Concavidade · Otimização · L'Hôpital · Taylor
              │     cada um: [Aprender] → sessão Ensinar   [Praticar] → sessão Praticar
              ├ Provas reais desta matéria   [Fazer] → sessão Prova
              ├ Provas simuladas   [Gerar] [Fazer] → sessão Prova
              └ Caderno de erros   cada erro: [Praticar isto] [Aprender isto]
```

Há dois tipos de dados:

- **Biblioteca:** dados compartilháveis na Etapa B, guardados em `<LH_DATA_DIR>/biblioteca/`.
- **Estudo pessoal:** sessões, respostas, notas e preferências. Fica nos registros de sessão que já existem e em `<LH_DATA_DIR>/estudo/`. **Nunca vai para a biblioteca.**

### 7.2 A biblioteca no disco

```
<LH_DATA_DIR>/biblioteca/
  materias/<CODIGO>/                          # ex.: ICE0784
    materia.json
    turmas/<semestre>-<docente-slug>/         # ex.: 2026-2-prof-exemplo
      turma.json
      plano.pdf                               # original importado
      referencias/<nome-original>             # slides, notebooks, listas
      referencias.json                        # arquivo → tópicos
    provas/<docente-slug>/<semestre>/<avaliacao-slug>/   # convenção matéria/professor/semestre/PX
      prova.json
      originais/<arquivos enviados>
    simulados/<id>/simulado.json
    perfis/<docente-slug>.json
```

Formato do JSON:

- formatado e com ordem de chaves estável, para gerar diffs limpos no git da Etapa B;
- toda raiz tem `"formato": 1`;
- leitores recusam formatos mais novos, como os guardas de versão que o app já usa.

Os textos em Markdown aceitam LaTeX (`$…$`), como já acontece no app.

Formatos (os nomes dos campos ficam em português, por consistência com o produto):

```ts
// materia.json
interface Materia {
  formato: 1;
  codigo: string;              // "ICE0784"
  nome: string;                // "Cálculo I"
  curso: string; unidade: string;
  ementa: string;
  objetivos: { geral: string[]; especificos: string[] };
  bibliografia: { basica: string[]; complementar: string[]; virtual: string[] }; // referências como texto
  topicos: Topico[];           // CANÔNICOS da matéria, valem para todas as turmas (regra abaixo)
}
interface Topico {
  id: string;                  // slug, ex. "teorema-do-valor-medio" — IMUTÁVEL depois de criado
  titulo: string;              // pode ser renomeado sem mudar o id
  descricao?: string;
  prompt?: string;             // prompt curado; ausente = gerado pelo modelo (7.6)
  arquivado?: boolean;         // tópico que saiu do plano mas ainda é citado por provas/sessões
}

// turma.json
interface Turma {
  formato: 1;
  id: string;                  // "2026-2-prof-exemplo"
  semestre: string;            // "2026-2"
  docente: { nome: string; slug: string };
  turno?: string; chTeorica?: number; chPratica?: number;
  aulas: Aula[];
  avaliacoes: Avaliacao[];
  criteriosMedia: string;      // texto livre, ex. "M=(N1+N2+N3)/3; N = 0,9·prova + 0,1·listas"
  recuperacao?: string; metodologia?: string;
  importadoEm: string; revisadoEm: string; // ISO
}
interface Aula {
  ordem: number; rotulo: string /* "41 e 42" */; data?: string /* AAAA-MM-DD */; ch?: number;
  conteudo: string; estrategias?: string; avaliacaoId?: string;
  topicos: string[];           // ids de Topico da MATÉRIA; vazio em aulas de avaliação/exercícios
}
interface Avaliacao {
  id: string;                  // "N3", "AV3", "PP2", "AVs"
  nome: string;                // "N3 — Avaliação escrita"
  tipo: "prova-escrita" | "prova-pratica" | "substitutiva" | "recuperacao" | "trabalho" | "apresentacao" | "lista" | "outra";
  posicao?: number;            // 1ª, 2ª, 3ª prova regular (liga provas antigas de semestres diferentes)
  data?: string;
  pontos?: number;             // escala da nota, ex. 10
  duracaoMin?: number;
  peso?: string;               // texto livre
  escopo: { topicos: string[] };
  observacoes?: string;
}

// referencias.json
interface Referencias { formato: 1; arquivos: { arquivo: string; titulo?: string; topicos: string[]; sha256: string }[] }
```

`prova.json` e `simulado.json` têm o mesmo formato de prova:

```ts
interface Prova {
  formato: 1;
  id: string;
  origem: "real" | "simulada";
  materia: string;                    // código
  docente?: { nome: string; slug: string };
  semestre?: string; avaliacaoRotulo?: string /* "P1", "N1"… como estava na prova */; posicao?: number;
  duracaoMin?: number; pontosTotais: number;
  instrucoes?: string;                // cabeçalho da prova
  questoes: Questao[];
  // real:
  originais?: string[];               // caminhos relativos em originais/
  // simulada:
  geracao?: { modelo: string; em: string; escopo: string[]; baseadoEm: string[] /* ids de provas reais/perfil */; custoEstimadoUsd?: number };
  revisadoEm?: string;
}
interface Questao {
  id: string; numero: string;         // "1", "2b"
  enunciado: string;                  // Markdown + LaTeX
  imagens?: string[];                 // figuras/recortes de página, caminhos relativos
  tipo: "discursiva" | "multipla-escolha" | "verdadeiro-falso" | "numerica" | "codigo" | "teste-de-mesa";
  alternativas?: { id: string; texto: string }[];
  itens?: Questao[];                  // subitens (a), (b)…; nota é a soma
  pontos: number | null;              // null = desconhecido na prova real (vira distribuição igual)
  topicos: string[];                  // ids de Topico da turma de referência
  gabarito: {
    origem: "professor" | "aluno" | "ia-verificada" | "ia-incerta";
    correta?: string | string[] | number;   // objetivas/numéricas/V-F
    tolerancia?: number;                    // numéricas
    solucao: string;                        // resolução completa (Markdown + LaTeX)
    criterios: { id: string; descricao: string; pontos: number }[]; // rubrica; soma = pontos
  };
}
```

**Regra dos tópicos** (decisão minha, depois da revisão):

- Os tópicos pertencem à **matéria**, não à turma. Toda prova, simulado, perfil, caderno de erros e vínculo de sessão guarda ids de tópico da matéria. Assim, uma segunda turma ou uma reimportação não quebra nada.
- Cada turma só liga as suas aulas aos tópicos da matéria (`Aula.topicos`).
- Ao importar uma turma, a extração **reaproveita os tópicos que já existem**, propondo a ligação por título e conteúdo. Só cria tópicos novos quando nenhum serve, e tudo passa pela revisão.
- Um id nunca muda. Renomear muda só o título.
- Um tópico citado por alguma prova ou sessão não pode ser apagado. Ele vira `arquivado` e some das listas de escopo.

O conteúdo de um tópico **numa turma** é o texto das aulas dessa turma ligadas a ele. É isso que aparece na preparação e no contexto das sessões.

### 7.3 Importar plano de ensino

1. **Biblioteca → Importar plano de ensino → escolher o PDF.**
2. **Converter o PDF em texto no servidor.** Reaproveitar a conversão local que já existe (a da importação de notas e `ctx.documents.toMarkdown`, sem OCR). Se o texto sair vazio, porque o PDF é escaneado, o builder decide se oferece visão a partir das páginas renderizadas ou se recusa com uma mensagem clara.
3. **Extrair a estrutura** com uma chamada ao modelo, com saída validada por schema (TypeBox ou Zod, que o repositório já usa) para `Materia` e `Turma`. A extração:
   - mapeia todo o cronograma em `aulas`;
   - **propõe os tópicos e liga cada aula a eles** (`Aula.topicos`). Junta as aulas de conteúdo e deixa de fora "Avaliação", "Resolução de exercícios" e "Revendo conceitos". Se a matéria já existe, reaproveita os tópicos dela pela regra da seção 7.2;
   - marca as `avaliacoes` com data, tipo, pontos e posição;
   - calcula o `escopo` de forma determinística.

   **Regra do escopo:** uma prova regular cobre os tópicos cujas aulas ficam depois da data da prova regular anterior e até a data desta. A substitutiva e a recuperação cobrem todos os tópicos. Trabalho, apresentação e lista ficam com escopo vazio.
4. **Tela de revisão**, toda editável:
   - identificação;
   - tabela de aulas;
   - lista de tópicos, onde se pode renomear, juntar, separar e reordenar;
   - avaliações, com o escopo em caixas de seleção por tópico;
   - bibliografia.

   O botão **Salvar na biblioteca** grava `materia.json`, `turma.json` e `plano.pdf`. **Nada é salvo sem passar por essa tela.**
5. **Matéria repetida:** se o código já existe, a importação acrescenta uma turma. Se a turma também já existe, pede confirmação antes de substituir.

O custo da chamada aparece como nos outros trabalhos de fundo.

### 7.4 Referências (slides e materiais)

Na turma, **Adicionar materiais** aceita vários arquivos ou uma pasta (PDF, `.ipynb`, `.md`, `.txt`, `.c`, `.py`, imagens). O fluxo:

1. Os arquivos são **copiados** para `referencias/`, sem duplicar o mesmo conteúdo, conferido por SHA-256.
2. O modelo sugere a quais tópicos cada arquivo pertence, a partir do nome, do texto das primeiras páginas e dos títulos do cronograma.
3. O dono confirma ou corrige as sugestões.

Copiar é decisão minha. Os originais em Downloads podem mudar de lugar, e na Etapa B a biblioteca vai para o git.

O builder deve confirmar que a política de acesso a arquivos (`src/agent/tools/fs-shared.ts`) deixa os agentes lerem `<LH_DATA_DIR>/biblioteca/`. Se não deixar, precisa abrir uma exceção explícita só para esse caminho.

### 7.5 Tela de preparação (por avaliação)

**Cabeçalho**
- matéria, docente, avaliação, data;
- **"faltam N dias"**, contados pela data local;
- tipo, pontos, duração e o texto de `peso` / `criteriosMedia`.

**Pergunta opcional:** "Quanto tempo você tem para estudar para esta prova?" (em horas). A resposta é guardada em `<LH_DATA_DIR>/estudo/preparacoes.json`, na chave `CODIGO/turmaId/avaliacaoId`.

**Tópicos do escopo.** Para cada tópico:
- título, aulas com datas e número de referências;
- **sinais tirados das próprias sessões**, sem nota:
  - **"aula feita"**: há uma sessão Ensinar ligada ao tópico que já entrou na fase de ensino, ou seja, já tem um `quiz`/`explain` marcado com nó;
  - **"praticado"**: há uma sessão Praticar ligada ao tópico com pelo menos um problema concluído;
  - **"errou em prova"**: perdeu pontos numa questão desse tópico em alguma sessão de Prova;
- links para essas sessões;
- os botões **Aprender** e **Praticar** (7.6).

**Próximos passos** (no máximo 5, por regras determinísticas, recalculadas a cada abertura; D = dias até a prova):

1. Se há duas ou mais provas reais desta matéria e D ≥ 5, sugerir a mais antiga como **diagnóstico**. A mais recente fica reservada para o ensaio final.
2. Tópicos sem "aula feita", em ordem de prioridade. Antes os que têm "errou em prova", depois os de maior incidência no perfil (se houver dado), e por fim a ordem do cronograma. A ordem do cronograma é o melhor indício de pré-requisito que temos.
3. Tópicos com "aula feita" e sem "praticado" → Praticar.
4. Se D ≤ 7 e pelo menos 60% dos tópicos têm "aula feita", sugerir a prova real reservada. Se não houver, sugerir gerar e fazer uma prova simulada.
5. Se D ≤ 2, sugerir praticar o caderno de erros.

Não há estimativa de minutos por tópico, para não inventar números. As horas informadas entram no contexto das sessões (7.6), e assim o professor do harness poda a árvore mínima para caber no tempo.

**Provas reais.** São as desta matéria, nesta ordem: primeiro as do mesmo docente com a mesma `posicao`, depois as do mesmo docente, depois as de outros. Cada uma mostra quantas das suas questões caem no escopo atual. Botão **Fazer**.

**Provas simuladas.** Lista as que já foram geradas para esta avaliação. Botões **Gerar** (7.9) e **Fazer**.

**Caderno de erros** (7.11).

### 7.6 Aprender e Praticar a partir de um tópico

Os dois botões criam **sessões nativas** dos tipos que já existem. As mudanças são as seguintes.

**Criação.** `POST /api/chats` passa a aceitar `ufjContext`:

```ts
{
  materia: string; turma: string; avaliacao: string; topico?: string;
  origem?: { tipo: "erro-de-prova"; sessaoProva: string; questao: string };
}
```

O servidor grava um **marcador `ufj-context`** como mensagem custom no início do registro. Ele segue o mesmo padrão do marcador `graph-context` (`src/core/native-messages.ts`). O texto que o modelo vê é montado no servidor a partir da biblioteca e traz:

- matéria e docente;
- avaliação, com data e dias restantes;
- o tópico, com o conteúdo das suas aulas;
- trecho relevante da ementa e dos objetivos;
- bibliografia básica;
- caminhos absolutos das referências do tópico;
- as horas informadas, se houver.

Os dados estruturados também ficam no payload do marcador. É por eles que a preparação encontra "as sessões deste tópico". O vínculo é **derivado** dos registros de sessão, sem índice separado; o builder pode pôr em cache.

**Primeira mensagem.** A nova sessão abre com o **campo de mensagem já preenchido** pelo prompt do tópico, e o aluno edita antes de enviar. Não há envio automático, porque o prompt fica visível e é ele que a biblioteca compartilha. O prompt é:

- `Topico.prompt`, se o dono escreveu um;
- senão, o modelo (editável na Etapa B pela biblioteca):
  - Aprender: *"Quero entender {tópico} para a {avaliação} de {matéria} ({data})."*
  - Praticar: *"Quero praticar {tópico} no nível da {avaliação} de {matéria}."*

**Praticar** também envia `graphContext`. Ele traz as proposições do grafo cuja proveniência inclui sessões ligadas ao tópico, até o limite de 64 que já existe. Se não houver nenhuma, a sessão começa livre a partir do tópico, o que a doutrina da prática já aceita.

**A partir de um erro de prova** (7.10, 7.11):

- **Praticar isto** abre uma Praticar com o enunciado da questão e a resposta do aluno. A doutrina da prática já cobre isso: *"If the learner brings a problem from outside — an exam problem…"*. Também envia o `graphContext` do tópico.
- **Aprender isto** abre uma Ensinar com o objetivo *"Na {prova} errei a questão {n} sobre {tópico}. A correção apontou: {falha}. Quero entender o que faltou."*

**As doutrinas não mudam.** Entra só um fragmento compartilhado novo (7.12) que explica o marcador UFJ:

- o escopo do plano e a data limitam o objetivo;
- as referências do professor são a fonte preferida de notação, exemplos e estilo, e o agente deve lê-las quando ajudar a alinhar a aula;
- as horas disponíveis apertam a árvore mínima.

### 7.7 Importar prova real

**Biblioteca → Matéria → Adicionar prova antiga.**

1. **Formulário:** arquivos da prova (PDF e/ou fotos, várias páginas); docente (escolher das turmas ou digitar); semestre; rótulo ("P1", "N1"…); posição (1ª, 2ª, 3ª, substitutiva); **gabarito opcional** (arquivos); e a pontuação por questão, se constar da prova.
2. **Trabalho de fundo** (na infraestrutura de jobs que já existe):
   1. **Transcrição.** Usa o texto do PDF quando há. Para fotos e PDFs escaneados, usa o modelo do slot Vision sobre as páginas, com o render nativo de PDF que o app já tem. O resultado são as questões, com subitens, alternativas, pontos e LaTeX. Figuras ficam como imagem da página ou recorte, a critério do builder.
   2. **Tópicos.** Cada questão é ligada aos tópicos da turma de referência por sugestão do modelo.
   3. **Gabarito:**
      - com arquivo de gabarito: transcrever e ligar às questões, com origem "professor" ou "aluno", conforme o formulário;
      - sem gabarito: o **resolvedor** (slot Strong) escreve solução, resposta e critérios. Depois um **verificador independente** resolve de novo **sem ver** a primeira solução.
        - Se concordarem, a origem é `ia-verificada`.
        - Se discordarem, é `ia-incerta`, destacada na revisão.
3. **Revisão sem estragar a prova** (decisão minha, depois da revisão). A revisão obrigatória mostra **só os enunciados**: transcrição, figuras, tópicos e pontos, tudo editável. O gabarito fica escondido atrás de um botão **"Revisar gabarito"**, com o aviso de que isso estraga a prova para você usá-la como diagnóstico ou ensaio.
   - Se o gabarito for aberto, a prova é marcada como **vista por você** (em `estudo/`, não na biblioteca). Os próximos passos deixam de sugeri-la como diagnóstico ou ensaio.
   - Gabaritos `ia-incerta` ficam assim até alguém revisar. Na correção, eles aparecem com ⚠️ e confiança baixa.
   - Na Etapa B, quem importa (o dono) revisa o gabarito, e os colegas recebem a prova intacta.

   O botão **Salvar** grava `prova.json` e `originais/`.

   **Agentes não leem provas.** As ferramentas de arquivo das sessões Ensinar e Praticar, e das perguntas laterais, **recusam** caminhos sob `biblioteca/**/provas/` e `biblioteca/**/simulados/`. Isso evita que uma questão seja reaproveitada e estrague a prova. A única exceção é o "Praticar isto", que entrega a questão errada de forma explícita no marcador. Os trabalhos que compõem simulados e os perfis acessam provas pelo serviço da biblioteca, não pelas ferramentas de arquivo.
4. **Perfil:** depois de salvar, o perfil do professor nesta matéria é recalculado (7.8).

### 7.8 Perfil do professor

`perfis/<docente-slug>.json` é calculado a partir das provas reais daquele docente naquela matéria. É recalculado a cada prova salva e pode ser editado pelo dono.

```ts
interface Perfil {
  formato: 1; docente: { nome: string; slug: string }; materia: string;
  baseadoEm: string[];                       // ids das provas reais
  numeroQuestoes?: { min: number; max: number; tipico: number };
  tipos?: Record<Questao["tipo"], number>;   // fração das questões
  pontosTotais?: number; duracaoMin?: number;
  estilo: string[];                          // observações do modelo, ex. "V ou F pedindo justificativa das falsas", "questão bônus"
  incidencia?: Record<string /* topicoId */, number>; // fração dos pontos — SÓ de dados reais
}
```

Os números (questões, tipos, pontos, incidência) são **contados por código** a partir das provas. Só `estilo` vem do modelo. Sem nenhuma prova real, não existe perfil, e a interface diz "sem provas antigas: estilo genérico".

### 7.9 Gerar prova simulada

Na preparação, **Gerar prova simulada** abre um formulário curto:

- número de questões: padrão é o `tipico` do perfil, senão 5;
- duração: padrão é a da `Avaliacao`, senão a do perfil, senão 100 min;
- tópicos: padrão é o escopo.

É um **trabalho de fundo**, com custo exibido:

1. **Compositor** (Strong). Recebe:
   - os tópicos do escopo com o conteúdo das aulas;
   - os caminhos das referências, que ele pode ler;
   - o perfil;
   - até duas provas reais do docente como **molde**: mistura de tipos, dificuldade, pontuação e jeito de perguntar.
   - **Na fatia 2, antes da importação estruturada:** o formulário aceita também **arquivos soltos de provas antigas** (fotos ou PDF), lidos pelo slot Vision só como exemplo de estilo. Esses arquivos não viram `prova.json` e não são guardados como prova real; a geração apenas registra que existiram em `geracao.baseadoEm`.

   Regras:
   - escrever **questões originais**, nunca cópias;
   - cada questão tem tópicos, pontos, solução e critérios;
   - os pontos somam `pontosTotais` (o do perfil, senão 10).
2. **Verificador.** Resolve cada questão de novo sem ver a solução. Se divergir, o compositor revisa a questão, até 2 rodadas. Se continuar divergindo, a questão é trocada ou marcada `ia-incerta`.
3. **Salvar** em `simulados/<id>/simulado.json`, com `geracao` preenchido.

Simulados ficam na biblioteca porque, na Etapa B, compartilhar simulados já gerados divide o custo entre os colegas. Gerar uma prova inteira é caro e lento com a chave de cada um.

### 7.10 A sessão do tipo Prova (`kind: "exam"`)

**Tipo novo.** `ChatKind` passa a ser `"teach" | "practice" | "exam"`. A Prova não aparece em "Nova sessão" como entrada livre. Ela é criada pela preparação, ou por uma prova na biblioteca, com `examContext`:

```ts
{ prova: { origem: "real" | "simulada"; caminho: string }; materia: string; turma: string; avaliacao: string;
  config: { cronometro: boolean; duracaoMin: number; permitirPausa: boolean } }
```

**Cópia congelada.** Na criação, a prova inteira, **incluindo gabarito**, é copiada para o registro da sessão. Editar a biblioteca depois não altera uma prova já feita.

**Gabarito protegido.** O gabarito e os critérios ficam só no servidor. As projeções para o navegador (`projectView`) e para o assistente de perguntas laterais (`core/side-chat.ts`) **removem** gabarito, critérios e a alternativa correta até a entrega. O builder decide se o estado da prova é um campo novo no `ChatRecord` (com versão do registro incrementada) ou se vai nas mensagens. Seja qual for, precisa garantir as quatro coisas: durável, congelado, sem vazar e com cronômetro confiável.

**Fases**

1. **Instruções.** Número de questões, duração, regras ("sem dicas, sem consulta ao assistente, entrega única") e botão **Começar**.
2. **Em andamento.**
   - **Folha de prova** com todas as questões, com Markdown, LaTeX e imagens. Cada uma tem campo de resposta conforme o tipo:
     - discursiva e numérica: área de texto com pré-visualização de Markdown e LaTeX;
     - múltipla escolha: alternativas, embaralhadas de forma determinística por sessão, como as perguntas que já existem;
     - verdadeiro ou falso: V/F por afirmação, com campo de justificativa;
     - código e teste de mesa: editor monoespaçado.
   - **Marcar para revisar** em cada questão.
   - **Rascunhos salvos no servidor** automaticamente, de forma durável.
   - **Cronômetro.** O início é carimbado no servidor, e o prazo é o início mais a duração mais as pausas. Sobrevive a recarregar a página e a fechar o app. Ao reabrir depois do prazo, a prova é entregue com os rascunhos salvos. Pausar só é possível se `permitirPausa` estiver ligado.
   - **Sem conversa.** O campo de mensagem fica escondido, não há turnos do agente, e as perguntas laterais ficam **desligadas**.
3. **Entrega.** Uma confirmação lista as questões em branco e as marcadas. Quando o tempo acaba, a prova é entregue sozinha.
4. **Correção** (7.11).
5. **Resultado e revisão.** Mostra o relatório (7.11). Daí em diante a sessão vira conversa com o agente de prova, que tira dúvidas sobre as questões, como na pausa da prática, e as perguntas laterais voltam.

**Agente de prova.** Tem prompts próprios em `src/agent/prompts/exam/` (`00-base.md` com as mecânicas e `10-doctrine.md` com a doutrina), mais um apêndice compartilhado explícito com voz, precisão, formatação, idioma e contexto UFJ, como a lista de permissões da prática. A doutrina:

- correção honesta: não amaciar nem inflar, como a seção VII da doutrina da prática;
- disciplina de critérios e evidência citada;
- confiança declarada;
- classificação de cada erro com a taxonomia da prática: não lembrou (cue miss), confundiu (discrimination), errou a execução (execution slip), descuido (careless), conceito errado (structural);
- reparos cirúrgicos na conversa pós-prova, sem virar aula, encaminhando para Praticar ou Aprender.

**O grafo.** Sessões de Prova **não** passam pela extração, como a prática.

**Plugins.** Plugins não enxergam o tipo `exam` na Etapa A. `PluginAgentKind` continua como está.

### 7.11 Correção, relatório e caderno de erros

**Correção**

1. **Determinística** (código):
   - múltipla escolha e a parte V/F: igualdade exata;
   - numérica: igualdade dentro da `tolerancia`;
   - teste de mesa: saída igual depois de normalizar espaços. Se igual, ganha os pontos todos; se diferente, vai para os critérios.
2. **Por critérios** (agente de prova, uma única chamada sobre a prova toda): discursivas, código, justificativas de V/F e testes de mesa que divergiram. Usa uma ferramenta de saída estruturada `corrigir_prova` (nome a critério do builder) que devolve, por questão:

```ts
{ questao: string; pontos: number;
  criterios: { id: string; pontos: number; evidencia: string /* trecho literal da resposta */ }[];
  comentario: string; tipoDeErro?: "nao-lembrou" | "confundiu" | "execucao" | "descuido" | "conceito";
  confianca: "alta" | "media" | "baixa" }
```

**Validação no servidor:**
- pontos entre 0 e o máximo do critério;
- soma dos critérios igual aos pontos da questão;
- toda questão corrigida.

Uma chamada inválida volta como erro corrigível, no padrão das ferramentas que já existem.

**Relatório**
- **Nota** na escala da avaliação, por exemplo 6,5/10, com o aviso "estimativa: X questões corrigidas pela IA".
- **Por questão:**
  - a sua resposta;
  - a solução, revelada agora;
  - os critérios com pontos e evidência;
  - o comentário e a confiança;
  - um selo da origem do gabarito. `ia-verificada` e `ia-incerta` levam o aviso ⚠️.
- **Por tópico:** pontos perdidos sobre pontos possíveis, com os 3 tópicos que mais custaram em destaque.
- Em cada questão com pontos perdidos, os botões **Praticar isto** e **Aprender isto** (7.6).
- **Contestar correção** em cada questão: envia uma mensagem para o agente de prova com o argumento do aluno. O agente pode recorrigir com a ferramenta `recorrigir_questao`. O resultado anterior fica no histórico, e a nota é atualizada.

**Caderno de erros** (na preparação e na matéria)
- É **derivado** de todas as sessões de Prova da matéria: cada questão com pontos perdidos vira uma entrada com enunciado, prova de origem, tópico, tipo de erro e data.
- A entrada mostra **"praticado depois"** quando existe uma sessão aberta pelo botão daquele erro.
- Não há agenda de revisão espaçada na Etapa A.

### 7.12 Português e os fragmentos novos de prompt

- **`shared/05-portugues.md`.** Todo o texto para o aluno sai em português do Brasil. Isso inclui:
  - explicações, perguntas e alternativas;
  - rótulos do mapa do plano;
  - problemas, veredictos e correções;
  - respostas laterais.

  A matemática fica em LaTeX. Os termos técnicos seguem o material do professor (por exemplo "struct", "ponteiro", "fila circular"). Entra em prober, teacher, practice (acrescentar à lista de permissões), exam e no apêndice das perguntas laterais.
- **`shared/12-contexto-ufj.md`.** Explica o marcador `ufj-context` (7.6). Entra nos mesmos lugares, menos no apêndice lateral.
- **Graph e trabalhos de fundo.** As instruções do extrator e do auditor do grafo passam a gerar as proposições em português. Pesquisa, visuais e demos escrevem em português o que o aluno vê.
- **Idioma dos prompts: nada em inglês** (decisão do dono, 18/11).
  - **Prompts novos** (prova, fragmentos, instruções dos trabalhos da biblioteca) são escritos **em português** desde o início.
  - **Todo o texto que o modelo lê também é traduzido na Etapa A** (fatia 1.5, seção 2.1):
    - `src/agent/system-prompt.md`;
    - todos os fragmentos em `src/agent/prompts/**` (cerca de 10,8 mil palavras);
    - as instruções dos workers em `src/agent/subagents/*.ts` (extração, auditor, pesquisa, PDF, visuais, demos);
    - as descrições das ferramentas e dos parâmetros, e as mensagens de erro e de resultado que o modelo lê, em `src/agent/tools*.ts`.
  - **Tradução fiel.** O método, a força das regras e os nomes de campos e ferramentas não mudam. Termos de pesquisa citados nas doutrinas ganham equivalentes em português, com o original entre parênteses só na primeira vez, por exemplo "pontos de decisão (*decision points*)".
  - **Conferência.** Depois de traduzir, um revisor compara cada arquivo com o original, procurando regra perdida, enfraquecida ou inventada. Os testes de composição (`tests/prompt-overrides.test.ts` e os testes de fluxo) continuam passando.
  - **Telas que já existem** no núcleo continuam na Etapa B, com o resto da interface, como combinado.
- **Telas novas** (biblioteca, preparação, importações, prova) são todas em português.

### 7.13 Onde mexer no código (ponto de partida para o plano)

- **Tipos e registros:**
  - `src/core/contracts/chat.ts` (`ChatKind`);
  - `src/store/chats.ts` (`createChat`);
  - `src/core/native-messages.ts` (marcadores `ufj-context` e `exam-context`; filtro de gabarito);
  - `src/core/view.ts` (`projectView`);
  - `src/core/side-chat.ts`.
- **Ramificações por tipo:** cerca de 90 pontos em uns 30 arquivos comparam com `"practice"`. Os principais são:
  - `components/chat.tsx`, `new-session.tsx`, `home.tsx` e `sidebar.tsx`;
  - `src/agent/teacher-agent.ts` e `src/server/chat-handler.ts`;
  - `src/agent/prompt-segments.ts` e `src/core/prompt-segments.ts`;
  - `src/server/compaction.ts`.

  Cada um precisa de uma decisão explícita para `exam`.
- **Criação de sessão:** `app/api/chats/route.ts` (`ufjContext`, `examContext`, `kind: "exam"`) e `components/start-session.ts`.
- **Agente e ferramentas:** `src/agent/prompts/exam/`, `src/agent/tools/exam.ts` e o registro em `src/agent/tools.ts`. Os novos fragmentos compartilhados entram na lista de prompts das Settings.
- **Trabalhos de fundo:** importação de plano, de prova real, geração de simulado e cálculo de perfil. **Atenção:** o sistema de jobs que existe hoje está preso a uma sessão. Todo `JobRecord` exige `chatId` e `toolCallId`, e entrega o resultado como mensagem na sessão. Os trabalhos da biblioteca não pertencem a uma sessão, então o builder projeta onde eles rodam, como sobrevivem a reiniciar o app e onde mostram o progresso e o custo. Pode ser um registro próprio de trabalhos da biblioteca, usando `src/agent/subagents/runner.ts` e a fila de permissões dos workers. É decisão do builder, com estas exigências:
  - progresso visível na biblioteca;
  - custo registrado;
  - cancelar;
  - resultado parcial nunca salvo sem revisão.
- **Biblioteca:**
  - `src/store/biblioteca.ts` (adaptador de arquivos, versão de formato, escrita atômica com `atomic-write.ts`);
  - `src/server/biblioteca.ts` (serviços);
  - `app/api/biblioteca/**` (rotas);
  - `app/biblioteca/**` (páginas);
  - `components/biblioteca/**`;
  - um item na barra lateral.
- **Empacotamento:** `scripts/build-server.mjs` inclui `prompts/exam/`.
- **Testes:** `tests/` com provedores falsos. No mínimo:
  - regra de escopo;
  - validação de formato e versão;
  - prova congelada e gabarito protegido (view e side-chat);
  - cronômetro e entrega automática ao reabrir;
  - correção determinística;
  - validação de `corrigir_prova`;
  - perfil contado por código;
  - vínculo sessão ↔ tópico derivado do marcador.

### 7.14 Identidade própria do app (fatia 1)

Hoje o `electron-builder.yml` herda a identidade do projeto original:

- `appId: com.learnharness.LearnHarness` e `productName: LearnHarness`, que dividiriam os dados com uma instalação do LearnHarness original;
- `publish` apontando para `amosblomqvist/learnharness`, o que faria a primeira atualização automática **trocar este app pelo original**;
- `desktop:dist` ligado ao time Apple e ao perfil de notarização do autor.

Na fatia 1, o mínimo é:

- **`appId`:** `br.ufj.learnharness-ufj`.
- **`productName`:** `LearnHarness UFJ`, com uma pasta de dados própria.
- **Atualização automática:** desligada até a Etapa B. O `publish` passa a apontar para `thallersubtil/learnharness-ufj`, sem publicar nada.
- **Script `desktop:local`:** gera um app **não assinado** para o Mac do dono (arm64), sem notarização. A partir do repositório, `npm run desktop:dev` continua funcionando.

Assinatura, notarização, instaladores para Windows e Linux e o fluxo de releases ficam para a Etapa B.

## 8. Decisões minhas (o dono deve conferir)

1. A biblioteca fica em `<LH_DATA_DIR>/biblioteca/`, e o estudo pessoal fica fora dela.
2. JSON formatado com `"formato": 1` e campos com nome em português.
3. Os tópicos são uma lista explícita, proposta na importação e revisada pelo dono. Não é uma aula por tópico.
4. O prompt do tópico preenche o campo de mensagem e não é enviado sozinho.
5. Prova real e simulada são feitas em condições de prova, com cronômetro ligado e pausa desligada por padrão. Os dois são ajustáveis ao começar. O treino com dicas é a Prática.
6. Perguntas laterais ficam desligadas durante a prova.
7. A prova é congelada no registro quando a sessão começa.
8. Objetivas são corrigidas por código. Discursivas, pelo agente com critérios, confiança e contestação.
9. Gabarito gerado pela IA passa por verificação independente e leva o selo ⚠️.
10. A incidência no perfil é contada só de provas reais.
11. ~~Os prompts novos são escritos em inglês~~ → **Corrigido pelo dono:** nada fica em inglês, incluindo os prompts. Os prompts novos nascem em português, e todo o texto que o modelo lê é traduzido na fatia 1.5 (7.12). Ficou como decisão minha só a ordem: a tradução vem logo depois da fatia 1, porque a saída já sai em português desde a fatia 1 pelo fragmento `05-portugues.md`.
12. Na Etapa A não há repetição espaçada nem estimativa de minutos. As horas entram no contexto.
13. Questões de código são corrigidas por critérios, sem executar o código.
14. O vínculo sessão ↔ tópico é derivado do marcador, sem índice próprio.
15. Os materiais são copiados para a biblioteca, não referenciados no lugar original.
16. Os tópicos pertencem à matéria, com ids imutáveis. Uma turma só liga as suas aulas a eles (7.2).
17. Na importação de prova real, o gabarito fica escondido na revisão, e quem abrir o gabarito marca a prova como "vista por você" (7.7).
18. As ferramentas de arquivo de Ensinar, Praticar e das perguntas laterais não leem `provas/` nem `simulados/` (7.7).
19. A identidade do app e a desativação da atualização automática entram já na fatia 1 (7.14).
20. A Etapa A é dividida em três fatias com metas por prova (2.1).

## 9. Etapa B: portas que a Etapa A deixa abertas

- `biblioteca/` é autocontida e pensada para git: arquivos de texto estáveis e originais em pastas. Na Etapa B ela vira um clone do repositório privado da organização, que o app sincroniza.
- Os dados pessoais nunca entram em `biblioteca/`.
- Simulados e perfis já moram na biblioteca, prontos para compartilhar.
- Importações e revisões já são o passo de "envio". Na Etapa B, salvar na biblioteca de um colega vira abrir um pull request para o dono aprovar.

## 10. Perguntas respondidas pelo dono (depois da revisão)

1. **Provas antigas.** O dono tem só de **Estrutura de Dados**, todas em **foto do celular**. Consequências:
   - a transcrição por visão é o caminho principal da importação, e não o reserva;
   - a ordem das fatias segue a seção 2.1;
   - o compositor de simulado aceita fotos como molde.
2. **Respostas com foto na prova.** **Não, só texto por enquanto.** A folha de prova aceita respostas digitadas (Markdown e LaTeX, código, alternativas, V/F). Responder com foto ou desenho passa a ser um **não-objetivo** da Etapa A, e a evidência dos critérios continua sendo um trecho literal da resposta.

## 11. Pesquisa de referência (GitHub, 18/11/2026)

- **[luumlabs/aula](https://github.com/luumlabs/aula)** (AGPL, Electron) é o mais próximo. Inspira o formato de prova por pacote (`exam {durationMinutes, totalPoints, aids}`, blueprint por seção), a seleção com semente, o relatório por habilidade e o planejador regressivo.
- **[HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor):** o modo "mimic" gera questões no molde de uma prova antiga.
- **[ZeKaiNie/universal-examprep-skill](https://github.com/ZeKaiNie/universal-examprep-skill):** dá prioridade às questões reais e marca a origem de cada item (🟢/🟡/⚠️).
- **[ValeraZSD/terramentor](https://github.com/ValeraZSD/terramentor):** verifica o gabarito resolvendo de novo sem ele e descarta o que for contestado.
- **[CAHLR/OATutor](https://github.com/CAHLR/OATutor)** e **[nazdridoy/obsidian-cbt-exam](https://github.com/nazdridoy/obsidian-cbt-exam):** tratam os modos como configuração (dicas, feedback, cronômetro).
- **[dsvi-b/corretor-enem](https://github.com/dsvi-b/corretor-enem)** e **[jin-zi-xuan/kaobuddy-pwa](https://github.com/jin-zi-xuan/kaobuddy-pwa):** corrigem por critérios com evidência e confiança, e alertam que a correção por IA não é confiável.
- **[simiao-cavalcante/edital-verticalizado](https://github.com/simiao-cavalcante/edital-verticalizado):** transforma o PDF institucional em JSON canônico e deixa a incidência como "sem dado" quando não há dados.
- **[elheremes/awesome-ufma](https://github.com/elheremes/awesome-ufma):** convenção de pastas para provas antigas, matéria/professor/período/PX.
- **Armadilhas registradas:**
  - extração de PDF é heurística e pede revisão;
  - truncamento silencioso de material longo: registrar quando houver amostragem;
  - gerar uma prova inteira custa caro, então compartilhar simulados;
  - sem escopo, a ferramenta vira chat genérico;
  - cronômetro que pausa sozinho não serve para prova.
