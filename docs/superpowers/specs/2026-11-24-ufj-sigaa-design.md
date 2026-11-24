# App autônomo integrado ao SIGAA da UFJ (design)

Data: 24/11/2026. Branch: `ufj/sigaa`, a partir de `ufj/etapa-a` (fatia 1).
Substitui a direção da Etapa B e muda o papel da biblioteca da fatia 1.

## 1. Intenção e porquê

O dono quer estudar para as provas do semestre sem montar nada à mão. As datas
de prova mudam com frequência, e o material de verdade (slides, listas,
gabaritos, vídeos, avisos) está no SIGAA, publicado pelo professor. Hoje o app
depende de importar o plano de ensino em PDF e enviar os slides um por um; uma
data que muda exige abrir "Editar plano" inteiro.

O que ele pediu:

- **Datas de prova fáceis de editar**, porque mudam com frequência.
- **O app se alimenta do que o professor cede ou indica**, e não só do plano de
  ensino: arquivos, tópicos de aula, referências.
- **Login com a conta da universidade (Login Único)** num campo do app. Com a
  conta registrada, o app lê o SIGAA do aluno e mostra calendário, atividades e
  todo o conteúdo disponibilizado, que vira referência para as aulas com a IA.
- **Uma leitura por semana basta**, depois que a conta está registrada.
- **Autônomo**: sem biblioteca compartilhada e sem nada online. A parte
  compartilhada pode voltar no futuro, mas o escopo agora é limitado.
- **Provas antigas** podem ser adicionadas como referência, mas achá-las é
  responsabilidade de cada aluno por enquanto.

Sucesso, para o dono: abrir o app e ver as provas e tarefas das próximas
semanas com as datas certas, e as aulas com a IA usando os slides que o
professor publicou, sem ter importado nada à mão.

O jeito de ensinar do LearnHarness não muda (sondar, árvore mínima, um passo por
vez com checagem, prática). Muda de onde vêm as matérias, as datas e os
materiais.

## 2. O que mudou em relação à Etapa A

| Antes (spec 2026-11-18) | Agora |
|---|---|
| Biblioteca compartilhada de prompts e referências, colegas enviam e o dono aprova | **Não existe.** Cada app é autônomo. |
| Etapa B: GitHub, organização privada, acesso restrito | **Suspensa.** Fica para o futuro. |
| Plano de ensino em PDF é a fonte das matérias | **SIGAA é a fonte.** O plano vira opcional. |
| Slides enviados pelo aluno; o modelo sugere os tópicos de cada um | Arquivos vêm do SIGAA **já pendurados no tópico de aula** pelo professor. Envio manual continua para extras. |
| Provas reais compartilhadas | Cada aluno adiciona as suas (fora desta entrega, ver §9). |

O que a fatia 1 construiu e continua valendo: identidade própria do app, a IA
em português (`05-portugues.md`, `12-contexto-ufj.md`), o marcador
`ufj-context`, a tela de preparação por prova, Aprender e Praticar a partir de
um tópico, o acesso dos agentes aos arquivos da pasta de dados, o registro de
horas e de uso, e o leitor de plano de ensino (`biblioteca-ia`).

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**

1. Conectar a conta UFJ uma vez e sincronizar sozinho toda semana.
2. Montar as matérias do semestre a partir do SIGAA: tópicos de aula (com
   datas), arquivos, provas e datas, tarefas, notícias, referências e vídeos.
3. Datas de prova editáveis com um clique, com a origem de cada data visível.
4. Sugerir datas que o SIGAA não tem estruturadas: pelas notícias e pelos
   tópicos de aula; em último caso, pelo plano de ensino.
5. Uma agenda com as provas, as tarefas e os avisos das próximas semanas.
6. A IA ensina e pratica usando os arquivos do tópico, publicados pelo
   professor.

**Não-objetivos (agora)**

- Compartilhar qualquer coisa entre alunos, ou qualquer serviço online do app.
- Escrever no SIGAA: enviar tarefa, responder questionário, postar em fórum.
- Ler notas, frequência, participantes, fóruns, chats, enquetes, questionários.
- Importar o calendário acadêmico (no SIGAA da UFJ é só um link para outro
  site).
- Transcrever vídeos (YouTube etc.); eles entram como referência com título e
  link.
- Notificações do sistema operacional.
- Mais de uma conta por app.
- Provas antigas, prova simulada e correção (fatias 2 e 3, ver §9).

**Anti-objetivos** (seria fracasso mesmo funcionando)

- **Bloquear a conta do aluno.** Nunca repetir login com senha recusada.
- **Vazar a senha.** Ela só vai para `sigaa.sistemas.ufj.edu.br` por HTTPS; não
  aparece em log, arquivo de diagnóstico ou mensagem de erro.
- **Sobrecarregar o SIGAA.** Nada de leituras a cada abertura, rajadas ou baixar
  de novo o que já foi baixado.
- **Mudar o que o aluno estuda por um palpite.** Data sugerida por notícia,
  tópico ou plano nunca é aplicada sem um clique.
- **Dados reais no repositório.** O repositório é público: páginas do SIGAA,
  nomes de professores e colegas, matrícula e telefone nunca são commitados.
- **Texto em inglês no app**, inclusive prompts e mensagens de erro novos.

## 4. Restrições

- **O SIGAA da UFJ** (`https://sigaa.sistemas.ufj.edu.br/sigaa/`, versão
  4.2.x) é o mesmo sistema da UFRN (o rodapé aponta para `sistemas.ufrn.br`).
  É JSF antigo: a navegação é por envio de formulário com
  `javax.faces.ViewState`, as páginas vêm em ISO-8859-1 e a sessão é presa a um
  nó do servidor pelo `JSESSIONID`.
- **Login direto**, sem CAS: formulário `loginForm` em `/sigaa/verTelaLogin.do`,
  enviado a `/sigaa/logar.do;jsessionid=…?dispatch=logOn` com `user.login`,
  `user.senha` e campos ocultos (`width`, `height`, `urlRedirect`,
  `subsistemaRedirect`, `acao`, `acessibilidade`). Senha recusada volta à mesma
  tela com "Usuário e/ou senha inválidos". Nenhum captcha visto (24/11/2026).
- **O servidor do app** é um processo Node filho do Electron
  (`ELECTRON_RUN_AS_NODE`, com canal IPC já aberto em `electron/main.cjs`). O
  chaveiro do Mac (`safeStorage`) só existe no processo principal.
- **Hoje as chaves de API** ficam em `auth.json` com permissão 0600, sem
  criptografia. A senha do SIGAA não pode seguir esse modelo.
- **Arquitetura do repositório**: zonas de import do ESLint (components → só o
  barril do core; app → core e server; core não importa agent/server/store);
  arquivos de rota do Next só exportam métodos HTTP; `params` é Promise.
- **Licença do código aproveitado**: o
  [sigaa-mcp](https://github.com/Pedromaia0/sigaa-mcp) é MIT. O que for
  adaptado leva o aviso de copyright e licença dele.
- **Prazos do dono**: ED 27/11, AC 01/12, POO ~07/12, Cálculo I 08/12. A ordem
  de entrega (§10) põe primeiro o que permite estudar com o SIGAA.

## 5. Abordagens consideradas

### 5.1 Como ler o SIGAA (decidido: direto, sem navegador)

1. **HTTP direto do servidor do app (escolhido).** Envia o login, guarda os
   cookies e refaz os cliques JSF como pedidos; lê o HTML com `linkedom` (já é
   dependência). Rápido, leve, testável com páginas de exemplo. Quebra se a UFJ
   mudar o HTML, como qualquer alternativa.
2. **Navegador escondido** (o Chromium interno que já roda os demos). Lida
   sozinho com JavaScript, mas é pesado, lento, só funciona no desktop e é
   difícil de testar.
3. **sigaa-mcp como dependência ou como servidor MCP.** O dono sugeriu usar o
   MCP encontrado. Decisão: **usar o código dele dentro do app**, adaptado.
   Como servidor MCP, a IA consultaria o SIGAA ao vivo em cada aula (login e
   várias páginas por pergunta); com a sincronização, tudo fica salvo e a aula
   não espera o SIGAA. Como dependência, não serve: ele é feito para a UFRN
   (login por CAS), está na versão 0.0.1, tem um autor só e lê seções que não
   queremos (notas, participantes). A navegação JSF, o cookie jar e a ideia dos
   leitores por seção são aproveitados. O código dele não roda com a senha do
   aluno sem ter sido lido.

### 5.2 Qual data de prova vale (decidido)

O dono decidiu: **o SIGAA sempre vence**, porque o professor atualiza as datas
lá. Depois do teste (§6), que mostrou que dois dos quatro professores não usam a
seção de datas, decidiu também: **sugerir pelas notícias (e tópicos) e, em
último caso, pelo plano de ensino**. Alternativas descartadas: "a edição do
aluno vence" e "sempre perguntar".

### 5.3 Onde ficam os arquivos (decidido, depois tornado definitivo)

Os arquivos baixados do SIGAA ficam só no app de quem sincronizou. Com o app
autônomo, não há para onde mais irem.

## 6. O que o SIGAA da UFJ tem (teste real, 24/11/2026)

Um script descartável entrou com a conta do dono, abriu as 4 turmas do semestre
e salvou as páginas fora do repositório.

| | POO | AC | ED | Cálculo I |
|---|---|---|---|---|
| Tópicos de aula com datas | 16 | 9 | 12 | 25 (aula a aula) |
| Arquivos | 16 | 19 | 29 | 7 |
| "Datas de Avaliações" | 1 | 2 (inclui a AV2 de 01/12) | nenhuma | nenhuma |
| Tarefas com prazo e instruções | 7+ | 6+ | várias | 2 |
| Notícias | 3 | ~10 | 6 | 4 |
| Referências / vídeos | – | 6 livros / 9 vídeos | – / vídeos nos tópicos | – |
| Plano de ensino em PDF nos arquivos | sim | ? | sim (tópico 1) | sim |
| "Visualizar Programa" | – | – | – | "não possui um programa cadastrado" |

O que se aprendeu:

- **Os tópicos de aula são o cronograma real.** Cada tópico tem título, período
  (`dd/mm/aaaa - dd/mm/aaaa`), descrição e os materiais daquela aula (arquivos,
  vídeos, tarefas). Aulas canceladas aparecem como tópico "Não Haverá Aula
  (dd/mm/aaaa)" com o motivo. Provas aparecem como tópicos ("Avaliação da
  aprendizagem (03/11/2026 - 03/11/2026)") ou como itens ("Prova 2 - Gabarito
  1ª chamada").
- **Datas de prova vêm de três lugares**: a seção "Datas de Avaliações" (data,
  hora, descrição, ex.: "2ª unidade"), as notícias ("2ª prova de EDI no dia
  04/11 Sala 06 CA2") e os tópicos de aula.
- **O portal** tem "Minhas atividades" com as próximas avaliações já
  cadastradas ("01/12/2026 (7 dias) … Avaliação: 2ª unidade").
- **Depois do login**, o SIGAA pode parar numa página de aviso (a Avaliação
  Institucional em `/sigaa/avaliacao/formulario_avaliacao/notificacao_view.jsf`).
  Ir direto a `/sigaa/portais/discente/discente.jsf` funciona.
- **Os links de turma** no portal são comandos JSF do formulário
  `formAtualizacoesTurmas` com o parâmetro `idTurma`.
- **Dentro da turma** (`/sigaa/ava/index.jsf`), o menu é o formulário
  `formMenu`. Rótulos na UFJ: Principal, Plano de Ensino, Participantes,
  Visualizar Programa, Fóruns, Chats Agendados, Notícias, Twitter, Frequência,
  Ver Grupo, Ver Notas, Conteúdo/Página web, Referências, Vídeos, Arquivos,
  Avaliações, Enquetes, Tarefas, Questionários, Situação dos Discentes,
  Estatísticas de Notas. ("Plano de Ensino", e não "Plano de Curso" como na
  UFRN.) Navegar cada seção a partir da página principal da turma funcionou nas
  4 turmas.
- **O cabeçalho da turma** traz `CÓDIGO - NOME (2026.2)`, por exemplo nos
  elementos `#linkCodigoTurma` e `#linkNomeTurma`; os tópicos usam
  `.topico-aula` e `.conteudotopico`.
- **O download** é um comando JSF com o parâmetro `id` na listagem de Arquivos;
  a resposta traz `Content-Disposition` com o nome do arquivo.
- **O portal não mostra o docente** da turma. O nome aparece em "Cadastrado por"
  das notícias e em Participantes (que não lemos).
- **Identidade no HTML**:
  - cada linha de "Datas de Avaliações" tem um `id` do SIGAA no comando
    "Visualizar" (ex.: `'id':'112270447'`);
  - cada arquivo tem o `id` do download;
  - **os tópicos de aula não têm id próprio**, só ids JSF por posição
    (`formAva:j_id_jsp_…:0:topico`), que mudam se o professor inserir um tópico
    antes.
- **A coluna "Hora"** de "Datas de Avaliações" nem sempre é uma hora: em AC
  aparece "53" e "27". Só vale quando tem o formato `HH:MM`.
- **Formatos dos materiais** (pelos ícones e nomes nos tópicos): 56 PDFs, 9
  cadernos Jupyter (`.ipynb`, POO), 1 `.zip` de códigos, 1 `.c`, fichas de
  avaliação em `.docx`/`.odt`, 13 vídeos, 19 tarefas. Nenhum PPTX.
- **"Minhas atividades"** no portal repete o que está em "Datas de Avaliações"
  (a AV2 de AC em 01/12).
- **As páginas reais** do teste estão guardadas fora do repositório, em
  `~/Library/Application Support/LearnHarness UFJ/diagnostico-sigaa/2026-11-24-teste/`
  (só a conta do Mac do dono lê). O construtor pode lê-las para escrever os
  leitores e as páginas de exemplo inventadas; nunca as copia para o
  repositório.

## 7. Design

### 7.1 Visão geral

```
Conta UFJ (usuário + senha no chaveiro)
        │  semanal / diário perto de prova / "Sincronizar agora"
        ▼
Leitor do SIGAA (servidor do app) ── login → portal → cada turma → seções → arquivos novos → sair
        │
        ▼
Dados locais por turma ── tópicos de aula, provas e datas, tarefas, notícias, referências, vídeos, arquivos
        │
        ├─► Matérias (antiga Biblioteca) ── provas com data editável e selo de origem, sugestões de data
        ├─► Preparação por prova (já existe) ── tópicos do escopo, Aprender / Praticar com os arquivos do tópico
        └─► Agenda ── próximas provas e tarefas, aulas canceladas, novidades
```

### 7.2 Conta UFJ e a senha

- Uma tela **Conta UFJ** (rota própria, com atalho na tela Matérias e na barra
  lateral enquanto não houver conta) com usuário, senha e **Entrar**. Entrar
  faz um login de verdade e, se der certo, guarda a conta e dispara a primeira
  sincronização.
- Conectado, a tela mostra: "Conectado como `<usuário>`", última sincronização,
  próxima, **Sincronizar agora** e **Sair da conta** (apaga a senha guardada e
  os cookies; os dados já baixados ficam).
- **A senha** é cifrada pelo processo principal do Electron com `safeStorage`
  (chave no chaveiro do Mac) e guardada cifrada na pasta de dados. O servidor
  pede a senha decifrada ao processo principal pelo canal IPC que já existe,
  só na hora de sincronizar, e a esquece em seguida. Em `npm run dev` (sem
  Electron) vale um substituto explícito para desenvolvimento; decisão do
  construtor, desde que o app empacotado nunca use o substituto.
- **Senha recusada**: o app marca a conta como "senha recusada", para de
  sincronizar e pede a senha de novo na tela Conta UFJ e num aviso na tela
  Matérias. Nunca tenta de novo sozinho.

### 7.3 A sincronização

**Quando**

- Ao abrir o app e de hora em hora enquanto ele estiver aberto, o servidor
  verifica se está na hora:
  - passou 7 dias desde a última sincronização bem-sucedida; **ou**
  - há uma prova nos próximos 7 dias e passou 24 horas desde a última.
- **Sincronizar agora** sempre roda (a não ser que outra já esteja rodando).
- Falha de rede ou SIGAA fora do ar: nova tentativa em 6 horas, no máximo.
- Uma sincronização por vez.

**O que lê** (só as turmas do semestre atual que estão no portal)

| Onde | O quê |
|---|---|
| Portal | lista de turmas (`idTurma`, nome); "Minhas atividades" (só para conferir e para a Agenda; nunca é fonte de data, ver §7.5) |
| Turma, Principal | cabeçalho (código, nome, semestre); tópicos de aula com período, descrição e materiais; aulas canceladas |
| Avaliações | data, hora, descrição |
| Tarefas | título, período de entrega, instruções, se há arquivo anexo |
| Notícias | título e data (o texto completo só das notícias novas) |
| Referências | livros e links indicados |
| Vídeos | título, descrição, link |
| Arquivos | nome, descrição, tópico de aula; baixa só os novos |
| Plano de Ensino | lido para achar o plano em PDF, se houver |

**Nunca lê**: Participantes, Ver Notas, Frequência, Fóruns, Chats Agendados,
Enquetes, Questionários, Situação dos Discentes, Estatísticas de Notas, Gerenciar
Perfil, Twitter, Ver Grupo. Esses rótulos ficam numa lista explícita de bloqueio,
além da lista do que se lê.

**Como navega** (validado no teste): GET da tela de login → POST do formulário
codificado em ISO-8859-1 → GET do portal (pulando páginas de aviso) → para cada
turma, portal novo (ViewState novo) e o comando que abre a turma → cada seção
pelo `formMenu` a partir da página principal da turma → downloads pela listagem
de Arquivos → GET `/sigaa/logar.do?dispatch=logOff`. Decodificar sempre os bytes
pelo charset da resposta (o `Response.text()` do Node decodifica como UTF-8 e
estraga os acentos).

**Respeito ao SIGAA**: pelo menos 0,8 s entre pedidos; cerca de 45 pedidos para
4 turmas mais os arquivos novos; um arquivo já baixado (mesmo `id` e mesmo nome)
não é baixado de novo; tamanho máximo por arquivo (decisão do construtor; o
limite de importação atual é 25 MB).

**Segurança**: lista fixa de hosts (`sigaa.sistemas.ufj.edu.br`); a senha só
entra no POST de login; nenhum redirecionamento leva a senha para outro host;
os cookies ficam só na memória; log sem valores de campo.

**Falhas parciais**: se uma seção de uma turma não puder ser lida, os dados
anteriores daquela seção ficam e a matéria mostra "Não consegui ler as tarefas
desta turma na última sincronização". Se nenhuma turma puder ser lida (estrutura
mudou), um aviso geral.

**Diagnóstico**: uma opção na tela Conta UFJ, "Salvar as páginas da próxima
sincronização", grava as páginas brutas numa pasta local de diagnóstico (fora
do repositório, dentro da pasta de dados) para consertar um leitor quebrado. A
senha nunca está nelas (a tela de login enviada não é salva).

### 7.4 O que a sincronização grava

Tudo fica na pasta de dados do app, numa área própria das matérias (o nome da
pasta e o formato são decisão do construtor; a área da biblioteca da fatia 1
pode ser reaproveitada). O mapeamento proposto, partindo dos tipos de
`src/core/biblioteca.ts`:

- **Matéria** ← cabeçalho da turma (`código`, `nome`). Ementa, objetivos e
  bibliografia ficam opcionais e vêm do plano, se importado.
- **Turma** ← semestre (`2026.2` → `2026-2`) e a identidade no SIGAA (`idTurma`,
  sufixo da turma como "TA"). Docente fica opcional.
- **Aula** ← um tópico de aula: ordem, título, data de início (e de fim),
  descrição, materiais, se foi cancelada.
- **Tópico de estudo** ← um por tópico de aula que não seja prova nem aviso de
  cancelamento. Como o SIGAA não dá id ao tópico de aula (§6), a identidade é
  esta (decisão minha):
  - o mesmo título normalizado (sem acentos, caixa e espaços extras) é o mesmo
    tópico, mesmo que o período mude;
  - título novo no lugar de um que sumiu, com o mesmo período, é o mesmo tópico
    renomeado;
  - qualquer outro caso é um tópico novo.

  O id do tópico de estudo nasce do título e não muda depois. Sessões, horas,
  escolhas de escopo e o marcador `ufj-context` se penduram nele. Um tópico que
  some do SIGAA vira arquivado se alguma sessão ou escolha o cita.
- **Prova (Avaliação)** ← ver §7.5. Cada data guarda a origem: `sigaa`,
  `manual`, ou sugestão aceita de `noticia`, `topico` ou `plano`.
- **Arquivo** ← `id` do SIGAA, nome, descrição, tópico de aula, SHA-256, caminho
  local. Liga-se ao tópico de estudo do seu tópico de aula, sem modelo.
- **Tarefas, notícias, referências indicadas e vídeos** ← listas por turma.
- **Estado da sincronização** ← última tentativa, último sucesso, erros por
  seção e o que é novo desde a anterior (para a Agenda).

Dados que já existam da fatia 1 para o mesmo código de matéria (plano importado
à mão) são ligados à turma do SIGAA; a forma de juntar fica com o construtor,
com a regra de que o cronograma passa a vir do SIGAA.

### 7.5 Datas das provas

**De onde vem a lista de provas**: da seção "Datas de Avaliações"; de
sugestões aceitas; do plano de ensino, se importado; ou do botão **Adicionar
prova** (nome e data).

**Precedência da data**

1. **SIGAA ("Datas de Avaliações")**: aplicada sozinha a cada sincronização,
   por cima de qualquer outra origem. A Agenda e a matéria mostram "O SIGAA mudou
   a 2ª unidade de 01/12 para 03/12".
2. **À mão**: o aluno clica na data e escolhe outra; salva na hora. Se a prova
   tem data do SIGAA, aparece antes "A próxima sincronização com o SIGAA troca
   esta data".
3. **Sugestões**, só com um clique, quando a prova não tem data do SIGAA:
   - **notícias e tópicos de aula**: títulos com "prova", "avaliação",
     "unidade", "N1"…"N3", "AV1"…"AV3" ou ordinais ("2ª prova") **e** uma data
     (`dd/mm`, `dd/mm/aaaa`, ou o período do próprio tópico). Sem modelo, sem
     custo. Exemplo: "Notícia de ED (23/10): '2ª prova de EDI no dia 04/11'.
     Usar 04/11 como data da 2ª prova?" [Usar] [Ignorar].
   - **plano de ensino**, em último caso: as datas das avaliações que o leitor
     de plano já extrai, para provas que não têm data de nenhuma outra origem.
4. Uma sugestão ignorada não volta, a não ser que o texto de origem mude.

**"Minhas atividades"** do portal não é fonte de data: ela repete "Datas de
Avaliações". Serve para a Agenda e para conferir; se um dia listar uma
avaliação que a turma não tem, vira uma sugestão como as das notícias.

**Ligar uma prova do SIGAA a uma prova do app**: pelo `id` da linha no SIGAA,
depois da primeira vez. Na primeira vez, pelo número ordinal ("2ª unidade" ↔ 2ª prova);
na dúvida, pergunta uma vez ("A '2ª unidade' do SIGAA é a 2ª prova?") e guarda a
resposta.

**Como aparece** (lista de provas da matéria e cabeçalho da preparação):

```
Provas                                          [Adicionar prova]
  1ª prova   15/10/2026   já passou                     do SIGAA
  2ª prova  [04/11/2026]  já passou                     sugerida (notícia)
  3ª prova  [08/12/2026]  em 14 dias   [Preparar]       à mão
  ┌ Sugestão: notícia de 20/11 "3ª prova no dia 10/12". Usar 10/12? [Usar] [Ignorar]
```

### 7.6 O que cai em cada prova

- Calculado pelas datas: os tópicos de estudo cujas aulas acontecem depois da
  prova anterior e antes desta. Tópicos de aula que são provas marcam o limite
  mesmo quando a prova do app ainda não tem data (ex.: "Avaliação da
  aprendizagem (03/11)" encerra o escopo da 2ª prova).
- Recalculado a cada sincronização e a cada mudança de data, porque os tópicos
  chegam ao longo do semestre. O aluno pode tirar ou pôr tópicos à mão; essas
  escolhas são guardadas e vencem o cálculo.
- Quando o recálculo muda o escopo de uma prova futura, a matéria e a Agenda
  avisam: "A 3ª prova passou a incluir: Regra da cadeia, Derivadas implícitas".
- Prova sem data e sem limite conhecido: a preparação pede "Defina a data desta
  prova para saber o que cai".

### 7.7 Telas

- **Matérias** (substitui "Biblioteca" na barra lateral): as turmas do semestre,
  cada uma com a próxima prova e a contagem de dias; o estado da sincronização;
  avisos (senha recusada, seção que falhou, sugestões pendentes).
- **Matéria**: provas (§7.5); tópicos de aula em linha do tempo, com os arquivos
  e vídeos de cada um; tarefas; notícias; referências indicadas; **Importar o
  plano de ensino** (§7.9); envio de materiais extras (o formulário de
  materiais da fatia 1 continua para o que não vem do SIGAA).
- **Preparação** (já existe): cabeçalho com a data editável e o selo de origem;
  tópicos do escopo; Aprender e Praticar.
- **Agenda** (nova, na barra lateral):

```
Próximos 14 dias
  Qui 27/11  ED · 3ª prova               em 3 dias        [Preparar]
  Seg 01/12  AC · 2ª unidade             em 7 dias        [Preparar]
  Ter 02/12  POO · Tarefa: Versão final  até 14/12 23:59
  Qua 03/12  Cálculo I · Não haverá aula (motivo)
Desde a última sincronização (24/11)
  ED: 3 arquivos novos · AC: notícia "Revisão na sexta" · AC: data da 2ª unidade mudou
```

- **Conta UFJ** (§7.2).

Todo texto em português. As telas seguem o estilo da fatia 1
(`components/biblioteca/*`).

### 7.8 Arquivos e a IA

- Ao abrir Aprender ou Praticar num tópico, o marcador `ufj-context` lista os
  arquivos daquele tópico de aula (caminho local e título), como a fatia 1 já
  faz com as referências.
- Os agentes leem esses arquivos pela política de acesso a arquivos, que já
  libera a pasta de dados das matérias mesmo com o acesso restrito.
- Formatos (decisão minha, pelo que o teste achou):
  - **PDF** é lido como hoje.
  - **Cadernos Jupyter** (`.ipynb`) são convertidos em texto ao baixar (células
    de texto e de código, sem as saídas grandes), sem dependência nova.
  - **Código e texto** (`.c`, `.py`, `.java`, `.txt`, `.md` e parecidos) são
    lidos como texto.
  - **`.zip`, `.docx`, `.odt` e o resto** são baixados e listados com o nome,
    mas a IA não os lê nesta entrega.
- Vídeos e links entram como referência (título e link); a IA não os abre.
- Tarefas do tópico (título e instruções) entram no contexto da prática, porque
  mostram o que o professor cobra.

### 7.9 Plano de ensino (opcional)

- Se a turma tem um arquivo que parece o plano (nome ou tópico com "plano de
  ensino"), a matéria oferece **Importar o plano de ensino do SIGAA**; senão,
  aceita um PDF enviado, como hoje.
- O leitor da fatia 1 (`biblioteca-ia`, modelo forte, custo mostrado) extrai
  ementa, objetivos, bibliografia, critérios de média e as datas das avaliações.
- O cronograma do plano **não** substitui os tópicos de aula do SIGAA. As datas
  do plano só viram sugestão de último caso (§7.5).

### 7.10 Testes e páginas de exemplo

- Páginas de exemplo para os leitores são feitas à mão a partir da estrutura
  real, com todo o texto inventado (nomes, matrícula, notícias, telefones). As
  páginas reais salvas no teste nunca entram no repositório.
- Cada leitor de seção tem testes com essas páginas, incluindo os casos vistos:
  seção vazia ("Nenhum item foi encontrado"), aula cancelada, prova como tópico,
  acentos em ISO-8859-1.
- A navegação é testada contra um SIGAA falso local (servidor HTTP de teste) que
  confere cookies, ViewState e o formulário de login, e cobre senha recusada,
  página de aviso depois do login, seção que falha e download.
- Nenhum teste acessa a rede.
- **Ninguém além do dono usa a senha.** Nem testes nem agentes. O plano tem um
  ponto de checagem em que o dono conecta a conta no app e roda a primeira
  sincronização real; o resultado (o que apareceu, o que faltou) volta para o
  construtor, que pode ler as páginas de diagnóstico dessa sincronização.

### 7.11 Onde mexer no código (ponto de partida)

- `src/server/sigaa/` (novo): sessão HTTP com cookies, ajudantes JSF,
  navegação, leitores por seção, download; aviso de licença MIT do sigaa-mcp no
  código adaptado.
- `src/core/`: tipos das matérias vindas do SIGAA, precedência de datas,
  detecção de sugestões, cálculo do escopo por datas (puros, testáveis).
- `src/store/`: gravação das matérias, arquivos e estado da sincronização.
- `electron/main.cjs`: cifrar e decifrar a senha com `safeStorage` e responder
  ao servidor pelo IPC.
- `app/api/**` e `app/` (rotas e páginas): Conta UFJ, sincronização, matérias,
  agenda; `components/` para as telas.
- `src/server/preparacao.ts` e `src/core/ufj-context.ts`: ler as matérias novas.

## 8. Decisões minhas (o dono deve conferir)

1. Código do sigaa-mcp adaptado dentro do app, não como servidor MCP nem como
   dependência (§5.1).
2. Senha cifrada no chaveiro do Mac pelo processo principal (§7.2).
3. Frequência: semanal, diária nos 7 dias antes de uma prova, e o botão
   **Sincronizar agora** (§7.3).
4. Só o semestre atual; seções lidas e nunca lidas (§7.3).
5. Os tópicos de aula do SIGAA viram os tópicos de estudo, e os arquivos ficam
   ligados ao tópico em que o professor os pôs, sem o modelo (§7.4).
6. **O escopo da prova é recalculado sozinho** a cada sincronização, com aviso,
   e as escolhas à mão do aluno vencem. Isso troca a proposta anterior ("o
   escopo nunca muda sozinho"), porque agora os tópicos chegam toda semana
   (§7.6).
7. Sugestões de data sem modelo, por palavras e datas nos títulos (§7.5).
8. "Biblioteca" vira "Matérias"; nova tela Agenda; o envio manual de materiais
   e a importação de plano por PDF continuam (§7.7, §7.9).
9. Opção de salvar páginas para diagnóstico (§7.3).
10. Identidade dos tópicos de aula pelo título normalizado, com a regra de
    renomeação (§7.4).
11. "Minhas atividades" só para a Agenda e para conferir (§7.5).
12. Formatos lidos pela IA: PDF, `.ipynb` convertido, código e texto; o resto só
    listado (§7.8).
13. Entrega em fatias finas, a primeira mirando a AV2 de AC em 01/12; a 3ª prova
    de ED em 27/11 fica fora de alcance deste trabalho (§10).

## 9. Fora desta entrega

- **Fatia 1.5** (traduzir tudo que ainda está em inglês, incluindo "Settings").
- **Provas antigas individuais** (fatia 3 adaptada): o aluno adiciona fotos ou
  PDFs de provas à matéria, como referência para a IA e para o perfil do
  professor.
- **Fatia 2**: sessão de prova, simulado, correção e caderno de erros.
- **Compartilhamento** entre alunos, se voltar no futuro.

## 10. Ordem de entrega sugerida (decisão minha)

Fatias finas, de ponta a ponta, para o app servir de estudo o quanto antes:

1. **Fatia fina, mirando a AV2 de AC (01/12)**: leitor do SIGAA só com login,
   portal, Principal (tópicos de aula), Arquivos (com download) e Avaliações;
   Conta UFJ com a senha no chaveiro e **Sincronizar agora**; Matérias e Matéria
   com provas de data editável e selo de origem; escopo por datas; preparação e
   Aprender/Praticar com os arquivos do tópico. Testes com SIGAA falso e páginas
   inventadas. Termina no ponto de checagem com o dono (§7.10).
2. **O resto do que se lê**: Tarefas, Notícias, Referências, Vídeos; a Agenda.
3. **Sugestões de data** (notícias, tópicos, plano), importar o plano do SIGAA,
   agendamento semanal e diário, e o diagnóstico.

A 3ª prova de ED (27/11) fica fora de alcance deste trabalho. Para ela, o app
atual já serve: importar o plano de ensino em PDF e os slides à mão.
