/**
 * O SEMESTRE DO ALUNO PARA A IA (spec chat+SIGAA §5.2–5.3).
 *
 * - `composeResumoUfj`: o bloco curto que entra em todo system prompt —
 *   matérias, próximas provas e tarefas. Pequeno de propósito: os detalhes
 *   ficam com a ferramenta `ufj`.
 * - `textoMaterias` / `textoMateria` / `textoNoticia`: o que a ferramenta
 *   devolve, em texto compacto, uma linha por item.
 *
 * Tudo puro. Quem lê a biblioteca e resolve caminhos é o servidor.
 */

import { TIPOS_COM_ESCOPO, type Materia, type Referencias, type Turma } from "./biblioteca.ts";
import { diasAte } from "./preparacao.ts";
import { formatarData, formatarDataCurta } from "./ufj-context.ts";

export interface TurmaDaMateria {
	materia: Materia;
	turma: Turma;
}

/** Dias à frente que o resumo cobre, e o teto de linhas. */
export const RESUMO_DIAS = 21;
export const RESUMO_LINHAS = 12;

export const RODAPE_RESUMO = "Para tópicos, arquivos do professor, instruções de tarefas e avisos, use a ferramenta `ufj`. Leia os arquivos pelo caminho que ela devolve.";

const PROVAS = new Set<string>(TIPOS_COM_ESCOPO);

/** A turma que a IA vê por matéria: a do SIGAA, senão a mais recente (por `revisadoEm`). */
export function turmasVisiveis(entradas: TurmaDaMateria[]): { visiveis: TurmaDaMateria[]; outras: TurmaDaMateria[] } {
	const porMateria = new Map<string, TurmaDaMateria[]>();
	for (const e of entradas) porMateria.set(e.materia.codigo, [...(porMateria.get(e.materia.codigo) ?? []), e]);
	const visiveis: TurmaDaMateria[] = [];
	const outras: TurmaDaMateria[] = [];
	for (const grupo of porMateria.values()) {
		const sigaa = grupo.filter((e) => e.turma.sigaa).sort((a, b) => b.turma.revisadoEm.localeCompare(a.turma.revisadoEm));
		const escolhida = sigaa[0] ?? [...grupo].sort((a, b) => b.turma.revisadoEm.localeCompare(a.turma.revisadoEm))[0]!;
		visiveis.push(escolhida);
		for (const e of grupo) if (e !== escolhida) outras.push(e);
	}
	return { visiveis, outras };
}

const emDias = (n: number) => (n === 0 ? "hoje" : n === 1 ? "em 1 dia" : `em ${n} dias`);

interface Compromisso {
	data: string;
	hora?: string;
	texto: string;
}

/** Os compromissos até `dias` à frente; sem nenhum, o próximo futuro de cada matéria. */
function proximos(porMateria: Compromisso[][], hoje: Date): Compromisso[] {
	const futuros = porMateria.map((lista) => lista.filter((c) => diasAte(c.data, hoje) >= 0).sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? "")));
	const noPrazo = futuros.flat().filter((c) => diasAte(c.data, hoje) <= RESUMO_DIAS);
	const lista = noPrazo.length > 0 ? noPrazo : futuros.flatMap((f) => (f[0] ? [f[0]] : []));
	return lista.sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "").localeCompare(b.hora ?? ""));
}

const linhaDe = (c: Compromisso, hoje: Date) => `${formatarDataCurta(c.data)}${c.hora ? ` ${c.hora}` : ""} ${c.texto} (${emDias(diasAte(c.data, hoje))})`;

export function composeResumoUfj(entradas: TurmaDaMateria[], hoje: Date): string {
	const { visiveis } = turmasVisiveis(entradas);
	if (visiveis.length === 0) return "";
	const linhas = [`[Semestre UFJ — ${formatarData(dataLocal(hoje))}]`];
	linhas.push(`Matérias: ${visiveis.map((e) => `${e.materia.codigo} ${e.materia.nome} (${e.turma.semestre})`).join("; ")}.`);
	const provas = proximos(
		visiveis.map((e) => e.turma.avaliacoes.filter((a) => PROVAS.has(a.tipo) && a.data).map((a) => ({ data: a.data!, texto: `${e.materia.nome} — ${a.nome}` }))),
		hoje,
	);
	if (provas.length) linhas.push(`Próximas provas: ${provas.map((c) => linhaDe(c, hoje)).join("; ")}.`);
	const tarefas = proximos(
		visiveis.map((e) => (e.turma.tarefas ?? []).filter((t) => t.fim).map((t) => ({ data: t.fim!, ...(t.hora ? { hora: t.hora } : {}), texto: `${e.materia.nome} — ${t.titulo}` }))),
		hoje,
	);
	if (tarefas.length) linhas.push(`Próximas tarefas: ${tarefas.map((c) => linhaDe(c, hoje)).join("; ")}.`);
	return [...linhas.slice(0, RESUMO_LINHAS - 1), RODAPE_RESUMO].join("\n");
}

/** "AAAA-MM-DD" da data local. */
function dataLocal(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const origem = (o?: string) => (o === "sigaa" ? "do SIGAA" : o === "plano" ? "do plano" : "à mão");

function linhaMateria(e: TurmaDaMateria, marca = ""): string {
	const quem = e.turma.docente.nome.trim() ? `, ${e.turma.docente.nome}` : "";
	const provas = e.turma.avaliacoes.filter((a) => PROVAS.has(a.tipo)).map((a) => `${a.nome}${a.data ? ` ${formatarDataCurta(a.data)} (${origem(a.origemData)})` : " sem data"}`);
	return `${e.materia.codigo} ${e.materia.nome} (${e.turma.semestre}${quem})${marca}: provas: ${provas.length ? provas.join("; ") : "nenhuma"}`;
}

/** Uma linha por turma visível; as outras ao fim, marcadas. */
export function textoMaterias(entradas: TurmaDaMateria[]): string {
	const { visiveis, outras } = turmasVisiveis(entradas);
	if (visiveis.length === 0) return "Nenhuma matéria sincronizada ainda.";
	return [...visiveis.map((e) => linhaMateria(e)), ...outras.map((e) => linhaMateria(e, " (plano importado)"))].join("\n");
}

/** Tópicos, provas, tarefas, notícias e arquivos de uma turma, com os caminhos. */
export function textoMateria(e: TurmaDaMateria, refs: Referencias, caminho: (arquivo: string) => string): string {
	const { materia, turma } = e;
	const blocos: string[] = [`${materia.codigo} ${materia.nome} (${turma.semestre})`];
	const ativos = materia.topicos.filter((t) => !t.arquivado && turma.aulas.some((a) => a.topicos.includes(t.id)));
	if (ativos.length) {
		blocos.push("Tópicos:\n" + ativos.map((t) => {
			const aulas = turma.aulas.filter((a) => a.topicos.includes(t.id) && a.data).map((a) => formatarDataCurta(a.data!));
			return `- ${t.id} — ${t.titulo}${aulas.length ? ` — aulas ${aulas.join(", ")}` : ""}`;
		}).join("\n"));
	}
	const provas = turma.avaliacoes.filter((a) => PROVAS.has(a.tipo));
	if (provas.length) blocos.push("Provas:\n" + provas.map((a) => `- ${a.nome} — ${a.data ? `${formatarData(a.data)} (${origem(a.origemData)})` : "sem data"} — escopo: ${a.escopo.topicos.join(", ") || "nenhum"}`).join("\n"));
	if (turma.tarefas?.length) blocos.push("Tarefas:\n" + turma.tarefas.map((t) => `- ${t.titulo}${t.fim ? ` — até ${formatarData(t.fim)}${t.hora ? ` ${t.hora}` : ""}` : ""}${t.temArquivo ? " — com arquivo" : ""}${t.instrucoes ? ` — ${t.instrucoes}` : ""}`).join("\n"));
	if (turma.noticias?.length) blocos.push("Notícias:\n" + turma.noticias.map((n) => `- ${n.sigaaId} ${formatarData(n.data)} ${n.titulo}`).join("\n"));
	if (refs.arquivos.length) {
		blocos.push("Arquivos:\n" + refs.arquivos.map((r) => {
			const aula = r.aula !== undefined ? turma.aulas.find((a) => a.ordem === r.aula) : undefined;
			return `- ${r.titulo ?? r.arquivo} — ${caminho(r.arquivo)}${aula?.sigaa ? ` — tópico de aula: ${aula.sigaa.titulo}` : ""}`;
		}).join("\n"));
	}
	return blocos.join("\n");
}

/** O texto completo de uma notícia, ou null. */
export function textoNoticia(e: TurmaDaMateria, sigaaId: string): string | null {
	const n = e.turma.noticias?.find((x) => x.sigaaId === sigaaId);
	if (!n) return null;
	return `${n.titulo} (${formatarData(n.data)})${n.texto ? `\n${n.texto}` : "\n(texto ainda não lido)"}`;
}
