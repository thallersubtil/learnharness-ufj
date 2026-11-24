/**
 * EDITAR AS PROVAS DE UMA TURMA (spec SIGAA §7.5–7.6): mudar a data com um
 * clique, adicionar uma prova e escolher à mão o que cai nela. Funções puras;
 * quem grava é o servidor. Toda mudança passa por `recalcularTurma`.
 */

import { BibliotecaEntradaError, BibliotecaNaoEncontradaError, slugify, type Avaliacao, type Turma } from "./biblioteca.ts";
import { aplicarEscopoManual, computeEscopos, computePosicoes, recalcularTurma } from "./biblioteca-escopo.ts";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function checarData(data: string): void {
	if (!DATA_RE.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) throw new BibliotecaEntradaError("Informe a data no formato AAAA-MM-DD.");
}

function comProva(turma: Turma, avaliacaoId: string, muda: (a: Avaliacao) => Avaliacao): Turma {
	if (!turma.avaliacoes.some((a) => a.id === avaliacaoId)) throw new BibliotecaNaoEncontradaError("Prova não encontrada.");
	return recalcularTurma({ ...turma, avaliacoes: turma.avaliacoes.map((a) => (a.id === avaliacaoId ? muda(a) : a)) });
}

/** Grava a data escolhida pelo aluno (origem "à mão"); `null` apaga a data. */
export function definirDataProva(turma: Turma, avaliacaoId: string, data: string | null): Turma {
	if (data !== null) checarData(data);
	return comProva(turma, avaliacaoId, (a) => {
		const { data: _d, origemData: _o, ...resto } = a;
		return data === null ? resto : { ...resto, data, origemData: "manual" };
	});
}

/** Uma prova nova, criada pelo aluno. O id nasce do nome ("3ª prova" → "3a-prova"). */
export function adicionarProva(turma: Turma, entrada: { nome: string; data?: string }): Turma {
	const nome = entrada.nome.trim();
	if (!nome) throw new BibliotecaEntradaError("Dê um nome à prova.");
	if (entrada.data !== undefined) checarData(entrada.data);
	const base = slugify(nome.normalize("NFKD")) || "prova";
	const usados = new Set(turma.avaliacoes.map((a) => a.id));
	let id = base;
	for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
	const prova: Avaliacao = { id, nome, tipo: "prova-escrita", escopo: { topicos: [] }, ...(entrada.data ? { data: entrada.data, origemData: "manual" as const } : {}) };
	return recalcularTurma({ ...turma, avaliacoes: [...turma.avaliacoes, prova] });
}

/** Grava o que o aluno quer na prova como diferença do escopo calculado. */
export function definirEscopoProva(turma: Turma, avaliacaoId: string, topicos: string[]): Turma {
	if (!turma.avaliacoes.some((a) => a.id === avaliacaoId)) throw new BibliotecaNaoEncontradaError("Prova não encontrada.");
	const semEscolhas = turma.sigaa
		? computeEscopos(computePosicoes(turma.avaliacoes, turma.aulas), turma.aulas).avaliacoes.find((a) => a.id === avaliacaoId)!.escopo.topicos
		: [];
	const quer = [...new Set(topicos)];
	const escopoManual = { incluidos: quer.filter((t) => !semEscolhas.includes(t)), excluidos: semEscolhas.filter((t) => !quer.includes(t)) };
	return comProva(turma, avaliacaoId, (a) => ({ ...a, escopoManual, escopo: { topicos: turma.sigaa ? aplicarEscopoManual(semEscolhas, escopoManual) : quer } }));
}
