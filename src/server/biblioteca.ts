/**
 * O SERVIÇO DA BIBLIOTECA UFJ (spec Etapa A §7.3–7.4): o único caminho que
 * grava matérias e turmas, sempre depois da revisão do dono.
 *
 * A regra dos tópicos vive aqui: ids nunca mudam, e um tópico que sai do plano
 * mas ainda é citado por uma turma ou por uma sessão volta como `arquivado`.
 */

import {
	BibliotecaConflitoError,
	BibliotecaEntradaError,
	BibliotecaNaoEncontradaError,
	parseMateria,
	parseTurma,
	type Materia,
	type Turma,
} from "../core/biblioteca.ts";
import { arquivarRemovidos, topicosReferenciados } from "../core/biblioteca-escopo.ts";
import type { BibliotecaStore } from "../core/ports.ts";
import { stores } from "./stores.ts";

export interface BibliotecaServiceDeps {
	biblioteca: BibliotecaStore;
	/** Ids de tópico citados por sessões (marcador ufj-context). */
	topicosEmSessoes: () => string[];
}

export interface BibliotecaListagem {
	materias: { materia: Materia; turmas: Turma[] }[];
	problemas: string[];
}

/** Toda referência de tópico da turma precisa existir na matéria e não estar arquivada. */
function checarReferencias(materia: Materia, turma: Turma): void {
	const ativos = new Set(materia.topicos.filter((t) => !t.arquivado).map((t) => t.id));
	const ruins = new Set<string>();
	for (const a of turma.aulas) for (const id of a.topicos) if (!ativos.has(id)) ruins.add(id);
	for (const av of turma.avaliacoes) for (const id of av.escopo.topicos) if (!ativos.has(id)) ruins.add(id);
	if (ruins.size) throw new BibliotecaEntradaError(`A turma cita tópicos que não estão ativos na matéria: ${[...ruins].map((x) => `"${x}"`).join(", ")}.`);
}

export function createBibliotecaService(deps: BibliotecaServiceDeps) {
	const { biblioteca } = deps;

	function topicosFinais(codigo: string, depois: Materia["topicos"], turmasConsideradas: Turma[]): Materia["topicos"] {
		const antes = biblioteca.readMateria(codigo)?.topicos ?? [];
		const referenciados = topicosReferenciados(turmasConsideradas, deps.topicosEmSessoes());
		return arquivarRemovidos(antes, depois, referenciados);
	}

	return {
		listar(): BibliotecaListagem {
			const { materias, problemas } = biblioteca.listMaterias();
			return { materias: materias.map((materia) => ({ materia, turmas: biblioteca.listTurmas(materia.codigo) })), problemas };
		},

		lerMateria(codigo: string): { materia: Materia; turmas: Turma[] } {
			const materia = biblioteca.readMateria(codigo);
			if (!materia) throw new BibliotecaNaoEncontradaError("Matéria não encontrada.");
			return { materia, turmas: biblioteca.listTurmas(codigo) };
		},

		lerTurma(codigo: string, turmaId: string) {
			const materia = biblioteca.readMateria(codigo);
			const turma = materia ? biblioteca.readTurma(codigo, turmaId) : null;
			if (!materia || !turma) throw new BibliotecaNaoEncontradaError("Turma não encontrada.");
			return { materia, turma, referencias: biblioteca.readReferencias(codigo, turmaId) };
		},

		/** Grava um plano revisado: matéria (tópicos reconciliados) e turma com o PDF original. */
		salvarPlano(d: { materia: unknown; turma: unknown; substituir: boolean }, planoPdf: Uint8Array): { codigo: string; turma: string } {
			const materiaNova = parseMateria(d.materia);
			const turma = parseTurma(d.turma);
			const codigo = materiaNova.codigo;
			if (biblioteca.readTurma(codigo, turma.id) && !d.substituir) throw new BibliotecaConflitoError();
			const outras = biblioteca.readMateria(codigo) ? biblioteca.listTurmas(codigo).filter((t) => t.id !== turma.id) : [];
			const materia: Materia = { ...materiaNova, topicos: topicosFinais(codigo, materiaNova.topicos, [...outras, turma]) };
			checarReferencias(materia, turma);
			biblioteca.writeMateria(materia);
			biblioteca.writeTurma(codigo, turma, planoPdf);
			return { codigo, turma: turma.id };
		},

		/** Edição da matéria: renomear, criar ou tirar tópicos (ids nunca mudam). */
		salvarMateria(codigoDoEndereco: string, raw: unknown): Materia {
			const editada = parseMateria(raw);
			if (editada.codigo !== codigoDoEndereco) throw new BibliotecaEntradaError("O código da matéria não confere com o endereço.");
			if (!biblioteca.readMateria(codigoDoEndereco)) throw new BibliotecaNaoEncontradaError("Matéria não encontrada.");
			// Um tópico tirado aqui que alguma turma ainda cita fica arquivado (não
			// some). A turma pode ser editada depois para tirá-lo das aulas.
			const materia: Materia = { ...editada, topicos: topicosFinais(editada.codigo, editada.topicos, biblioteca.listTurmas(editada.codigo)) };
			biblioteca.writeMateria(materia);
			return materia;
		},

		/** Edição da turma: aulas, avaliações e escopos (só tópicos ativos da matéria). */
		salvarTurma(codigo: string, turmaIdDoEndereco: string, raw: unknown): Turma {
			const turma = parseTurma(raw);
			if (turma.id !== turmaIdDoEndereco) throw new BibliotecaEntradaError("O id da turma não confere com o endereço.");
			const materia = biblioteca.readMateria(codigo);
			if (!materia || !biblioteca.readTurma(codigo, turma.id)) throw new BibliotecaNaoEncontradaError("Turma não encontrada.");
			checarReferencias(materia, turma);
			biblioteca.writeTurma(codigo, turma);
			return turma;
		},
	};
}

export type BibliotecaService = ReturnType<typeof createBibliotecaService>;

/**
 * A instância de produção. `topicosEmSessoes` passa a ler as sessões quando o
 * marcador ufj-context existir (tarefa 8); até lá nenhuma sessão cita tópicos.
 */
export const bibliotecaService: BibliotecaService = createBibliotecaService({
	biblioteca: stores.bibliotecaStore,
	topicosEmSessoes: () => [],
});
