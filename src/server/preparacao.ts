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
import { composeUfjContextText, type UfjContextPayload } from "../core/ufj-context.ts";
import type { BibliotecaStore, EstudoStore } from "../core/ports.ts";
import type { ChatSummary, GraphNode } from "../core/contracts.ts";
import { GRAPH_CONTEXT_PICK_LIMIT } from "./graph-context.ts";
import { stores } from "./stores.ts";

export interface PreparacaoDeps {
	biblioteca: BibliotecaStore;
	estudo: EstudoStore;
	listChats: () => ChatSummary[];
	readNodes: () => GraphNode[];
	/** Dias até a data (AAAA-MM-DD); ligado na tarefa 9. */
	diasAte?: (data: string) => number;
}

const defaultDeps = (): PreparacaoDeps => ({
	biblioteca: stores.bibliotecaStore,
	estudo: stores.estudoStore,
	listChats: () => stores.chatStore.listChats(),
	readNodes: () => stores.graphStore.readNodes(),
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
