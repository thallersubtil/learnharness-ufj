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
	type Referencias,
	type Turma,
} from "../core/biblioteca.ts";
import { arquivarRemovidos, topicosReferenciados } from "../core/biblioteca-escopo.ts";
import { adicionarProva as adicionarProvaNaTurma, definirDataProva, definirEscopoProva } from "../core/provas.ts";
import type { BibliotecaStore } from "../core/ports.ts";
import { MAX_IMPORT_BYTES } from "../../lib/notes-import-limits.ts";
import { stores } from "./stores.ts";
import { EXTENSOES_MATERIAIS, bibliotecaIa, trechoDoArquivo, type BibliotecaIa } from "./biblioteca-ia.ts";

export interface BibliotecaServiceDeps {
	biblioteca: BibliotecaStore;
	/** Ids de tópico citados por sessões (marcador ufj-context). */
	topicosEmSessoes: () => string[];
	/** Chamadas de modelo (sugestão de tópicos dos materiais). */
	ia?: BibliotecaIa;
}

/** Envio grande demais (o mesmo limite das importações de notas, 25 MiB). */
export class BibliotecaEnvioGrandeError extends Error {
	constructor() {
		super("O envio é grande demais. O limite é 25 MB por vez.");
		this.name = "BibliotecaEnvioGrandeError";
	}
}

export interface BibliotecaListagem {
	materias: { materia: Materia; turmas: Turma[] }[];
	problemas: string[];
}

/**
 * Toda referência de tópico da turma precisa existir na matéria. Tópicos
 * ARQUIVADOS saem das aulas e dos escopos (spec §7.2: "some das listas de
 * escopo"); só um id que a matéria não conhece é erro. Assim, arquivar um
 * tópico em outra turma nunca deixa esta sem conseguir salvar.
 */
function limparReferencias(materia: Materia, turma: Turma): Turma {
	const conhecidos = new Set(materia.topicos.map((t) => t.id));
	const ativos = new Set(materia.topicos.filter((t) => !t.arquivado).map((t) => t.id));
	const desconhecidos = new Set<string>();
	const filtra = (ids: string[]) => ids.filter((id) => {
		if (!conhecidos.has(id)) desconhecidos.add(id);
		return ativos.has(id);
	});
	const limpa: Turma = {
		...turma,
		aulas: turma.aulas.map((a) => ({ ...a, topicos: filtra(a.topicos) })),
		avaliacoes: turma.avaliacoes.map((av) => ({ ...av, escopo: { topicos: filtra(av.escopo.topicos) } })),
	};
	if (desconhecidos.size) throw new BibliotecaEntradaError(`A turma cita tópicos que não estão na matéria: ${[...desconhecidos].map((x) => `"${x}"`).join(", ")}.`);
	return limpa;
}

export function createBibliotecaService(deps: BibliotecaServiceDeps) {
	const { biblioteca } = deps;

	/** Tópicos citados pelos materiais de todas as turmas da matéria. */
	function citadosPorMateriais(codigo: string): string[] {
		return biblioteca.listTurmas(codigo).flatMap((t) => biblioteca.readReferencias(codigo, t.id).arquivos.flatMap((a) => a.topicos));
	}

	function topicosFinais(codigo: string, depois: Materia["topicos"], turmasConsideradas: Turma[]): Materia["topicos"] {
		const antes = biblioteca.readMateria(codigo)?.topicos ?? [];
		const referenciados = topicosReferenciados(turmasConsideradas, [...deps.topicosEmSessoes(), ...citadosPorMateriais(codigo)]);
		return arquivarRemovidos(antes, depois, referenciados);
	}

	return {
		listar(): BibliotecaListagem {
			const { materias, problemas } = biblioteca.listMaterias();
			const todos = [...problemas];
			const lista = materias.map((materia) => {
				const r = biblioteca.listTurmasComProblemas(materia.codigo);
				todos.push(...r.problemas);
				return { materia, turmas: r.turmas };
			});
			return { materias: lista, problemas: todos };
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
			return { materia, turma, referencias: biblioteca.readReferencias(codigo, turmaId), arquivos: biblioteca.listReferenciaFiles(codigo, turmaId) };
		},

		/**
		 * Copia materiais para a turma (sem revisão: são arquivos do próprio dono)
		 * e pede sugestões de tópico só para os que não eram repetidos. NÃO grava
		 * o mapeamento — isso é o salvarReferencias, depois da revisão.
		 */
		async adicionarMateriais(codigo: string, turmaId: string, arquivos: { nome: string; bytes: Uint8Array }[], signal?: AbortSignal) {
			const materia = biblioteca.readMateria(codigo);
			if (!materia || !biblioteca.readTurma(codigo, turmaId)) throw new BibliotecaNaoEncontradaError("Turma não encontrada.");
			if (arquivos.length === 0) throw new BibliotecaEntradaError("Escolha pelo menos um arquivo.");
			for (const a of arquivos) {
				const ext = a.nome.includes(".") ? a.nome.slice(a.nome.lastIndexOf(".")).toLowerCase() : "";
				if (!(EXTENSOES_MATERIAIS as readonly string[]).includes(ext)) throw new BibliotecaEntradaError(`Tipo de arquivo não aceito: ${a.nome}`);
			}
			if (arquivos.reduce((t, a) => t + a.bytes.byteLength, 0) > MAX_IMPORT_BYTES) throw new BibliotecaEnvioGrandeError();
			const adicionados: { arquivo: string; reutilizado: boolean }[] = [];
			const novos: { arquivo: string; trecho: string }[] = [];
			for (const a of arquivos) {
				const copia = a.bytes.slice(); // a conversão de PDF pode consumir o buffer
				const r = biblioteca.addReferenciaFile(codigo, turmaId, a.nome, a.bytes);
				adicionados.push({ arquivo: r.arquivo, reutilizado: r.reutilizado });
				if (!r.reutilizado) novos.push({ arquivo: r.arquivo, trecho: await trechoDoArquivo(r.arquivo, copia) });
			}
			if (novos.length === 0) return { adicionados, sugestoes: [], custoUsd: null };
			if (!deps.ia) throw new Error("bibliotecaService sem serviço de IA");
			const { sugestoes, custoUsd } = await deps.ia.sugerirTopicosDosMateriais(codigo, turmaId, novos, signal);
			return { adicionados, sugestoes, custoUsd };
		},

		/** Grava o mapeamento revisado arquivo → tópicos (substitui o referencias.json inteiro). */
		salvarReferencias(codigo: string, turmaId: string, mapa: unknown) {
			const materia = biblioteca.readMateria(codigo);
			if (!materia || !biblioteca.readTurma(codigo, turmaId)) throw new BibliotecaNaoEncontradaError("Turma não encontrada.");
			const lista = (mapa as { arquivos?: unknown })?.arquivos;
			if (!Array.isArray(lista)) throw new BibliotecaEntradaError("Envie a lista de arquivos com seus tópicos.");
			const conhecidos = new Set(materia.topicos.map((t) => t.id));
			const ativos = new Set(materia.topicos.filter((t) => !t.arquivado).map((t) => t.id));
			// O que o SIGAA sabe de cada arquivo (id, aula, título) não vem do formulário: fica.
			const antes = new Map(biblioteca.readReferencias(codigo, turmaId).arquivos.map((a) => [a.arquivo, a]));
			const arquivos = lista.map((x) => {
				const e = x as { arquivo?: unknown; titulo?: unknown; topicos?: unknown };
				if (typeof e?.arquivo !== "string") throw new BibliotecaEntradaError("Cada item precisa do nome do arquivo.");
				const sha256 = biblioteca.referenciaSha256(codigo, turmaId, e.arquivo);
				if (!sha256) throw new BibliotecaEntradaError(`O arquivo "${e.arquivo}" não está guardado nesta turma.`);
				const topicos = Array.isArray(e.topicos) ? e.topicos : [];
				for (const id of topicos) if (typeof id !== "string" || !conhecidos.has(id)) throw new BibliotecaEntradaError(`O tópico "${String(id)}" não está na matéria.`);
				// Tópicos arquivados saem do mapeamento em vez de travar o salvamento.
				const anterior = antes.get(e.arquivo);
				const entrada: Referencias["arquivos"][number] = { arquivo: e.arquivo, topicos: (topicos as string[]).filter((id) => ativos.has(id)), sha256 };
				if (typeof e.titulo === "string" && e.titulo.trim()) entrada.titulo = e.titulo.trim();
				else if (anterior?.titulo) entrada.titulo = anterior.titulo;
				if (anterior?.sigaaId) entrada.sigaaId = anterior.sigaaId;
				if (anterior?.aula !== undefined) entrada.aula = anterior.aula;
				return entrada;
			});
			biblioteca.writeReferencias(codigo, turmaId, { formato: 1, arquivos });
			return biblioteca.readReferencias(codigo, turmaId);
		},

		/** Grava um plano revisado: matéria (tópicos reconciliados) e turma com o PDF original. */
		salvarPlano(d: { materia: unknown; turma: unknown; substituir: boolean }, planoPdf: Uint8Array): { codigo: string; turma: string } {
			const materiaNova = parseMateria(d.materia);
			const turma = parseTurma(d.turma);
			const codigo = materiaNova.codigo;
			if (biblioteca.readTurma(codigo, turma.id) && !d.substituir) throw new BibliotecaConflitoError();
			const outras = biblioteca.readMateria(codigo) ? biblioteca.listTurmas(codigo).filter((t) => t.id !== turma.id) : [];
			const materia: Materia = { ...materiaNova, topicos: topicosFinais(codigo, materiaNova.topicos, [...outras, turma]) };
			const turmaLimpa = limparReferencias(materia, turma);
			biblioteca.writeMateria(materia);
			biblioteca.writeTurma(codigo, turmaLimpa, planoPdf);
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
			const limpa = limparReferencias(materia, turma);
			biblioteca.writeTurma(codigo, limpa);
			return limpa;
		},

		/** Mudar a data de uma prova com um clique (spec SIGAA §7.5); `null` apaga. */
		definirData(codigo: string, turmaId: string, avaliacaoId: string, data: string | null): Turma {
			const { turma } = turmaExistente(codigo, turmaId);
			const nova = definirDataProva(turma, avaliacaoId, data);
			biblioteca.writeTurma(codigo, nova);
			return nova;
		},

		/** Uma prova criada pelo aluno. */
		adicionarProva(codigo: string, turmaId: string, entrada: { nome: string; data?: string }): Turma {
			const { turma } = turmaExistente(codigo, turmaId);
			const nova = adicionarProvaNaTurma(turma, entrada);
			biblioteca.writeTurma(codigo, nova);
			return nova;
		},

		/** O que o aluno quer que caia na prova (só tópicos ativos da matéria). */
		definirEscopo(codigo: string, turmaId: string, avaliacaoId: string, topicos: string[]): Turma {
			const { materia, turma } = turmaExistente(codigo, turmaId);
			for (const id of topicos) if (!materia.topicos.some((t) => t.id === id)) throw new BibliotecaEntradaError(`Tópico desconhecido: "${id}".`);
			// Tópicos arquivados saem da escolha em vez de travar o salvamento.
			const ativos = topicos.filter((id) => materia.topicos.some((t) => t.id === id && !t.arquivado));
			const nova = definirEscopoProva(turma, avaliacaoId, ativos);
			biblioteca.writeTurma(codigo, nova);
			return nova;
		},
	};

	function turmaExistente(codigo: string, turmaId: string): { materia: Materia; turma: Turma } {
		const materia = biblioteca.readMateria(codigo);
		const turma = materia ? biblioteca.readTurma(codigo, turmaId) : null;
		if (!materia || !turma) throw new BibliotecaNaoEncontradaError("Turma não encontrada.");
		return { materia, turma };
	}
}

export type BibliotecaService = ReturnType<typeof createBibliotecaService>;

/** A instância de produção: os tópicos citados por sessões vêm do marcador ufj-context. */
export const bibliotecaService: BibliotecaService = createBibliotecaService({
	biblioteca: stores.bibliotecaStore,
	topicosEmSessoes: () => stores.chatStore.listChats().flatMap((c) => (c.ufj?.topico ? [c.ufj.topico] : [])),
	ia: bibliotecaIa,
});
