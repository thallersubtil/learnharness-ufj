/**
 * O CONTEXTO UFJ DE UMA SESSÃO (spec Etapa A §7.6).
 *
 * Uma sessão criada pela biblioteca começa com o marcador `ufj-context`: o
 * texto que o modelo lê (composeUfjContextText) e o payload que a tela usa
 * (UfjContextPayload). Os prompts de Aprender e Praticar são o que o aluno vê
 * no campo de mensagem — e o que a biblioteca compartilha na Etapa B.
 */

import type { Aula, Avaliacao, Materia, Topico, Turma } from "./biblioteca.ts";
import type { UfjContextRef } from "./contracts/chat.ts";

export type { UfjContextRef } from "./contracts/chat.ts";

/** O payload do marcador: os ids do vínculo e os nomes que o cartão mostra
 *  (guardados no marcador para a sessão abrir mesmo se a biblioteca mudar). */
export interface UfjContextPayload extends UfjContextRef {
	materiaNome: string;
	docente: string;
	/** Ausente num vínculo de material. */
	avaliacaoNome?: string;
	/** AAAA-MM-DD */
	data?: string;
	topicoTitulo?: string;
	/** O título do material, num vínculo de material. */
	arquivoTitulo?: string;
}

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-03" → "03/11/2026"; texto fora do formato volta como veio. */
export function formatarData(data: string): string {
	const m = DATA_RE.exec(data);
	return m ? `${m[3]}/${m[2]}/${m[1]}` : data;
}

/** "2026-11-03" → "03/11". */
export function formatarDataCurta(data: string): string {
	const m = DATA_RE.exec(data);
	return m ? `${m[3]}/${m[2]}` : data;
}

/** Número em português (vírgula decimal): 1.5 → "1,5". */
const numeroPt = (n: number) => String(n).replace(".", ",");

function quandoFalta(dias: number): string {
	if (dias === 0) return " (hoje)";
	if (dias < 0) return " (já passou)";
	return dias === 1 ? " (falta 1 dia)" : ` (faltam ${dias} dias)`;
}

export interface UfjContextTextInput {
	materia: Materia;
	turma: Turma;
	/** Ausente num vínculo de material. */
	avaliacao?: Avaliacao;
	/** Ausente num vínculo de prova inteira (os tópicos do escopo vêm em `topicosDaProva`). */
	topico?: Topico;
	/** As aulas desta turma ligadas ao tópico, na ordem do cronograma. */
	aulas: Aula[];
	/** Vínculo de prova inteira: os tópicos do escopo, com as datas das aulas. */
	topicosDaProva?: { titulo: string; datas: string[] }[];
	/** Vínculo de material: o arquivo escolhido, listado antes dos outros. */
	material?: { caminho: string; titulo: string };
	referencias: { caminho: string; titulo: string }[];
	/** Dias até a avaliação, ou null quando ela não tem data. */
	dias: number | null;
	/** Horas que o aluno informou para esta avaliação, ou null. */
	horas: number | null;
}

/** O texto exato que o modelo lê no início da sessão (linhas sem dado são omitidas). */
export function composeUfjContextText(i: UfjContextTextInput): string {
	const { materia, turma, avaliacao, topico } = i;
	const linhas = [
		"[Contexto UFJ] — sessão criada pela biblioteca do aluno.",
		// Turmas do SIGAA podem vir sem curso e sem docente: a linha só diz o que sabe.
		`Disciplina: ${materia.codigo} ${materia.nome}${materia.curso.trim() ? ` — ${materia.curso}` : ""}, UFJ.${turma.docente.nome.trim() ? ` Professor(a): ${turma.docente.nome}.` : ""} Semestre: ${turma.semestre}.`,
	];
	if (avaliacao) {
		let linhaAvaliacao = `Avaliação: ${avaliacao.nome}`;
		if (avaliacao.data) linhaAvaliacao += ` — ${formatarData(avaliacao.data)}`;
		if (avaliacao.data && i.dias !== null) linhaAvaliacao += quandoFalta(i.dias);
		if (avaliacao.pontos !== undefined) linhaAvaliacao += `; ${numeroPt(avaliacao.pontos)} pontos`;
		if (avaliacao.duracaoMin !== undefined) linhaAvaliacao += `; duração ${numeroPt(avaliacao.duracaoMin)} min`;
		linhas.push(`${linhaAvaliacao}.`);
	}
	if (topico) linhas.push(`Tópico: ${topico.titulo}${topico.descricao ? ` — ${topico.descricao}` : ""}`);
	if (i.topicosDaProva?.length) {
		linhas.push("Tópicos que caem nesta avaliação:");
		for (const t of i.topicosDaProva) linhas.push(`- ${t.titulo}${t.datas.length ? ` (aulas ${t.datas.join(", ")})` : ""}`);
	}
	if (i.material) linhas.push(`Material escolhido pelo aluno: \`${i.material.caminho}\` — ${i.material.titulo}`);
	if (i.aulas.length) {
		linhas.push("Aulas deste tópico no cronograma:");
		for (const a of i.aulas) linhas.push(`- Aula ${a.rotulo}${a.data ? ` (${formatarDataCurta(a.data)})` : ""}: ${a.conteudo}`);
	}
	if (materia.ementa.trim()) linhas.push(`Ementa da disciplina: ${materia.ementa.trim()}`);
	if (materia.bibliografia.basica.length) linhas.push(`Bibliografia básica: ${materia.bibliografia.basica.join("; ")}`);
	if (i.referencias.length) {
		linhas.push(i.topicosDaProva ? "Materiais do professor para estes tópicos (leia quando ajudar a alinhar a sessão):" : "Materiais do professor para este tópico (leia quando ajudar a alinhar a sessão):");
		for (const r of i.referencias) linhas.push(`- \`${r.caminho}\` — ${r.titulo}`);
	}
	if (i.horas !== null) linhas.push(`Tempo que o aluno tem para estudar para esta avaliação: ${numeroPt(i.horas)} h.`);
	return linhas.join("\n");
}

/** O prompt de "Estudar com a IA" num material, pré-preenchido. */
export function promptMaterial(p: UfjContextPayload): string {
	return `Quero estudar o material "${p.arquivoTitulo ?? p.arquivo ?? "do professor"}" de ${p.materiaNome}.`;
}

/** O prompt de "Revisar para a prova", pré-preenchido. */
export function promptRevisao(p: UfjContextPayload): string {
	return `Quero revisar para a ${p.avaliacaoNome ?? "prova"} de ${p.materiaNome}${p.data ? ` (${formatarDataCurta(p.data)})` : ""}.`;
}

/** O prompt de Aprender, pré-preenchido no campo de mensagem. */
export function promptAprender(p: UfjContextPayload): string {
	return `Quero entender ${p.topicoTitulo ?? "este tópico"} para a ${p.avaliacaoNome ?? "prova"} de ${p.materiaNome}${p.data ? ` (${formatarDataCurta(p.data)})` : ""}.`;
}

/** O prompt de Praticar, pré-preenchido no campo de mensagem. */
export function promptPraticar(p: UfjContextPayload): string {
	return `Quero praticar ${p.topicoTitulo ?? "este tópico"} no nível da ${p.avaliacaoNome ?? "prova"} de ${p.materiaNome}.`;
}
