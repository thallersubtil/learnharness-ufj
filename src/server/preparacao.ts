/**
 * SESSÕES E PREPARAÇÃO A PARTIR DA BIBLIOTECA UFJ (spec Etapa A §7.5–7.6).
 *
 * - ufjMarkerFor: o marcador `ufj-context` de uma sessão criada por um tópico
 *   (texto para o modelo + payload para a tela), montado da biblioteca.
 * - practicePicksForTopico: as proposições do grafo nascidas nas sessões
 *   daquele tópico, para a sessão Praticar começar do que já foi ensinado.
 */

import {
	BibliotecaEntradaError,
	isValidCodigo,
	isValidSlug,
	type Aula,
	type Materia,
	type Turma,
} from "../core/biblioteca.ts";
import type { UfjContextRef } from "../core/contracts.ts";
import { newUfjContextMessage, type GraphContextPick, type LhMarkerMessage } from "../core/native-messages.ts";
import { composeUfjContextText, promptAprender, promptPraticar, type UfjContextPayload } from "../core/ufj-context.ts";
import { diasAte, proximosPassos, sinaisPorTopico, type PreparacaoView, type TopicoPreparacao } from "../core/preparacao.ts";
import type { BibliotecaStore, EstudoStore } from "../core/ports.ts";
import type { ChatSummary, GraphNode } from "../core/contracts.ts";
import { GRAPH_CONTEXT_PICK_LIMIT } from "./graph-context.ts";
import { stores } from "./stores.ts";

export interface PreparacaoDeps {
	biblioteca: BibliotecaStore;
	estudo: EstudoStore;
	listChats: () => ChatSummary[];
	readNodes: () => GraphNode[];
	/** Dias até a data (AAAA-MM-DD), pela data local de hoje. */
	diasAte?: (data: string) => number;
}

const defaultDeps = (): PreparacaoDeps => ({
	biblioteca: stores.bibliotecaStore,
	estudo: stores.estudoStore,
	listChats: () => stores.chatStore.listChats(),
	readNodes: () => stores.graphStore.readNodes(),
	diasAte: (data) => diasAte(data, new Date()),
});

const DESCONHECIDO = "Matéria, turma, avaliação ou tópico desconhecido.";

/** Valida a forma de um ufjContext vindo do navegador. */
export function parseUfjContextRef(raw: unknown): UfjContextRef {
	const r = raw as Record<string, unknown> | null;
	if (!r || typeof r !== "object") throw new BibliotecaEntradaError(DESCONHECIDO);
	const { materia, turma, avaliacao, topico } = r;
	if (typeof materia !== "string" || !isValidCodigo(materia)) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (typeof turma !== "string" || !isValidSlug(turma)) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (typeof avaliacao !== "string" || !avaliacao.trim()) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (topico !== undefined && (typeof topico !== "string" || !isValidSlug(topico))) throw new BibliotecaEntradaError(DESCONHECIDO);
	return { materia, turma, avaliacao, ...(topico ? { topico } : {}) };
}

/** Matéria, turma, avaliação e tópico (ativo) de um vínculo — ou BibliotecaEntradaError. */
export function resolveUfjRef(ref: UfjContextRef, deps: Pick<PreparacaoDeps, "biblioteca">) {
	let materia: Materia | null;
	let turma: Turma | null;
	try {
		materia = deps.biblioteca.readMateria(ref.materia);
		turma = materia ? deps.biblioteca.readTurma(ref.materia, ref.turma) : null;
	} catch {
		throw new BibliotecaEntradaError(DESCONHECIDO);
	}
	const avaliacao = turma?.avaliacoes.find((a) => a.id === ref.avaliacao);
	const topico = ref.topico ? materia?.topicos.find((t) => t.id === ref.topico && !t.arquivado) : undefined;
	if (!materia || !turma || !avaliacao || !ref.topico || !topico) throw new BibliotecaEntradaError(DESCONHECIDO);
	const aulas: Aula[] = turma.aulas.filter((a) => a.topicos.includes(topico.id)).sort((x, y) => x.ordem - y.ordem);
	return { materia, turma, avaliacao, topico, aulas };
}

export function chaveHoras(ref: Pick<UfjContextRef, "materia" | "turma" | "avaliacao">): string {
	return `${ref.materia}/${ref.turma}/${ref.avaliacao}`;
}

/** O marcador ufj-context de uma sessão criada por um tópico da biblioteca. */
export function ufjMarkerFor(ref: UfjContextRef, deps: PreparacaoDeps = defaultDeps()): LhMarkerMessage {
	const { materia, turma, avaliacao, topico, aulas } = resolveUfjRef(ref, deps);
	const refs = deps.biblioteca.readReferencias(materia.codigo, turma.id).arquivos.filter((a) => a.topicos.includes(topico.id));
	const referencias = refs.map((a) => ({ caminho: deps.biblioteca.referenciaPath(materia.codigo, turma.id, a.arquivo), titulo: a.titulo ?? a.arquivo }));
	const dias = avaliacao.data && deps.diasAte ? deps.diasAte(avaliacao.data) : null;
	const horas = deps.estudo.readHoras(chaveHoras(ref));
	const content = composeUfjContextText({ materia, turma, avaliacao, topico, aulas, referencias, dias, horas });
	const payload: UfjContextPayload = {
		materia: materia.codigo,
		turma: turma.id,
		avaliacao: avaliacao.id,
		topico: topico.id,
		materiaNome: materia.nome,
		docente: turma.docente.nome,
		avaliacaoNome: avaliacao.nome,
		...(avaliacao.data ? { data: avaliacao.data } : {}),
		topicoTitulo: topico.titulo,
	};
	return newUfjContextMessage(payload, content);
}

/** As proposições nascidas (ou citadas) nas sessões deste tópico, em ordem de criação, até 64. */
export function practicePicksForTopico(ref: UfjContextRef, deps: PreparacaoDeps = defaultDeps()): GraphContextPick[] {
	const chats = new Set(deps.listChats().filter((c) => c.ufj?.materia === ref.materia && c.ufj?.topico === ref.topico).map((c) => c.id));
	if (chats.size === 0) return [];
	return deps
		.readNodes()
		.filter((n) => n.provenance.some((p) => chats.has(p.chatId)))
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.slice(0, GRAPH_CONTEXT_PICK_LIMIT)
		.map((n) => ({ id: n.id, name: n.name, statement: n.statement }));
}

const SEM_ESCOPO = "Esta avaliação está sem escopo. Edite o plano para escolher os tópicos.";

/** A view da tela de preparação de uma avaliação (spec §7.5). */
export function preparacaoView(ref: { materia: string; turma: string; avaliacao: string }, hoje: Date, deps: PreparacaoDeps = defaultDeps()): PreparacaoView {
	let materia: Materia | null;
	let turma: Turma | null;
	try {
		materia = deps.biblioteca.readMateria(ref.materia);
		turma = materia ? deps.biblioteca.readTurma(ref.materia, ref.turma) : null;
	} catch {
		throw new BibliotecaEntradaError("Matéria, turma ou avaliação desconhecida.");
	}
	const avaliacao = turma?.avaliacoes.find((a) => a.id === ref.avaliacao);
	if (!materia || !turma || !avaliacao) throw new BibliotecaEntradaError("Matéria, turma ou avaliação desconhecida.");
	const sinais = sinaisPorTopico(deps.listChats(), { materia: materia.codigo });
	const refs = deps.biblioteca.readReferencias(materia.codigo, turma.id).arquivos;
	const primeiraAula = (id: string) => Math.min(...turma.aulas.filter((a) => a.topicos.includes(id)).map((a) => a.ordem), Number.POSITIVE_INFINITY);
	const ativos = avaliacao.escopo.topicos
		.map((id, i) => ({ topico: materia.topicos.find((t) => t.id === id && !t.arquivado), i }))
		.filter((x): x is { topico: NonNullable<typeof x.topico>; i: number } => x.topico !== undefined)
		.sort((a, b) => primeiraAula(a.topico.id) - primeiraAula(b.topico.id) || a.i - b.i);
	const topicos: TopicoPreparacao[] = ativos.map(({ topico }) => {
		const s = sinais.get(topico.id);
		const payload: UfjContextPayload = {
			materia: materia.codigo, turma: turma.id, avaliacao: avaliacao.id, topico: topico.id,
			materiaNome: materia.nome, docente: turma.docente.nome, avaliacaoNome: avaliacao.nome,
			...(avaliacao.data ? { data: avaliacao.data } : {}), topicoTitulo: topico.titulo,
		};
		return {
			id: topico.id,
			titulo: topico.titulo,
			aulas: turma.aulas.filter((a) => a.topicos.includes(topico.id)).sort((x, y) => x.ordem - y.ordem).map((a) => ({ rotulo: a.rotulo, ...(a.data ? { data: a.data } : {}) })),
			referencias: refs.filter((r) => r.topicos.includes(topico.id)).length,
			aulaFeita: s?.aulaFeita ?? false,
			praticado: s?.praticado ?? false,
			sessoes: s?.sessoes ?? [],
			ufjContext: { materia: materia.codigo, turma: turma.id, avaliacao: avaliacao.id, topico: topico.id },
			promptAprender: topico.prompt?.trim() || promptAprender(payload),
			promptPraticar: promptPraticar(payload),
		};
	});
	return {
		materia: { codigo: materia.codigo, nome: materia.nome },
		turma: { id: turma.id, semestre: turma.semestre, docente: turma.docente.nome },
		avaliacao,
		dias: avaliacao.data ? diasAte(avaliacao.data, hoje) : null,
		horas: deps.estudo.readHoras(chaveHoras(ref)),
		criteriosMedia: turma.criteriosMedia,
		topicos,
		passos: proximosPassos(topicos),
		avisos: topicos.length === 0 ? [SEM_ESCOPO] : [],
	};
}

/** Grava (ou apaga, com null) as horas disponíveis para uma avaliação. */
export function salvarHoras(raw: unknown, deps: PreparacaoDeps = defaultDeps()): { horas: number | null } {
	const r = raw as { materia?: unknown; turma?: unknown; avaliacao?: unknown; horas?: unknown } | null;
	const horas = r?.horas;
	if (horas !== null && (typeof horas !== "number" || !Number.isFinite(horas) || horas <= 0 || horas > 200)) {
		throw new BibliotecaEntradaError("Informe um número de horas entre 0 e 200.");
	}
	if (typeof r?.materia !== "string" || typeof r.turma !== "string" || typeof r.avaliacao !== "string") throw new BibliotecaEntradaError("Matéria, turma ou avaliação desconhecida.");
	preparacaoView({ materia: r.materia, turma: r.turma, avaliacao: r.avaliacao }, new Date(), deps); // valida os ids
	deps.estudo.writeHoras(chaveHoras({ materia: r.materia, turma: r.turma, avaliacao: r.avaliacao }), horas);
	return { horas };
}
