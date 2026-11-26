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
	BibliotecaFormatoError,
	isValidCodigo,
	isValidNomeArquivo,
	isValidSlug,
	type Aula,
	type Materia,
	type Turma,
} from "../core/biblioteca.ts";
import { UFJ_ORIGENS, type UfjContextRef, type UfjOrigem } from "../core/contracts.ts";
import { newUfjContextMessage, type GraphContextPick, type LhMarkerMessage } from "../core/native-messages.ts";
import { composeUfjContextText, formatarDataCurta, promptAprender, promptPraticar, promptRevisao, type UfjContextPayload } from "../core/ufj-context.ts";
import { diasAte, proximosPassos, revisoesDaProva, sinaisPorTopico, type PreparacaoView, type TopicoPreparacao } from "../core/preparacao.ts";
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

/** Valida a forma de um ufjContext vindo do navegador (spec chat+SIGAA §5.4):
 *  tópico (avaliação + tópico), material (arquivo) ou prova (avaliação, sem tópico). */
export function parseUfjContextRef(raw: unknown): UfjContextRef {
	const r = raw as Record<string, unknown> | null;
	if (!r || typeof r !== "object") throw new BibliotecaEntradaError(DESCONHECIDO);
	const { materia, turma, avaliacao, topico, origem, arquivo } = r;
	if (typeof materia !== "string" || !isValidCodigo(materia)) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (typeof turma !== "string" || !isValidSlug(turma)) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (origem !== undefined && !(UFJ_ORIGENS as readonly unknown[]).includes(origem)) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (topico !== undefined && (typeof topico !== "string" || !isValidSlug(topico))) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (avaliacao !== undefined && (typeof avaliacao !== "string" || !avaliacao.trim())) throw new BibliotecaEntradaError(DESCONHECIDO);
	if (arquivo !== undefined && (typeof arquivo !== "string" || !isValidNomeArquivo(arquivo))) throw new BibliotecaEntradaError(DESCONHECIDO);
	const o = (origem as UfjOrigem | undefined) ?? "topico";
	if (o === "material" ? !arquivo : !avaliacao) throw new BibliotecaEntradaError(DESCONHECIDO);
	return {
		materia,
		turma,
		...(avaliacao ? { avaliacao: avaliacao as string } : {}),
		...(topico ? { topico } : {}),
		...(origem ? { origem: o } : {}),
		...(arquivo ? { arquivo: arquivo as string } : {}),
	};
}

/** Matéria, turma, avaliação e tópico (ativo) de um vínculo — ou BibliotecaEntradaError. */
export function resolveUfjRef(ref: UfjContextRef, deps: Pick<PreparacaoDeps, "biblioteca">) {
	let materia: Materia | null;
	let turma: Turma | null;
	try {
		materia = deps.biblioteca.readMateria(ref.materia);
		turma = materia ? deps.biblioteca.readTurma(ref.materia, ref.turma) : null;
	} catch (err) {
		if (err instanceof BibliotecaFormatoError) throw err; // a causa real, não "desconhecido"
		throw new BibliotecaEntradaError(DESCONHECIDO);
	}
	const avaliacao = turma?.avaliacoes.find((a) => a.id === ref.avaliacao);
	const topico = ref.topico ? materia?.topicos.find((t) => t.id === ref.topico && !t.arquivado) : undefined;
	if (!materia || !turma || !avaliacao || !ref.topico || !topico) throw new BibliotecaEntradaError(DESCONHECIDO);
	const aulas: Aula[] = turma.aulas.filter((a) => a.topicos.includes(topico.id)).sort((x, y) => x.ordem - y.ordem);
	return { materia, turma, avaliacao, topico, aulas };
}

export function chaveHoras(ref: Pick<UfjContextRef, "materia" | "turma" | "avaliacao">): string {
	return `${ref.materia}/${ref.turma}/${ref.avaliacao ?? ""}`;
}

const NOMES_REF = (deps: Pick<PreparacaoDeps, "biblioteca">, materia: Materia, turma: Turma) => {
	const refs = deps.biblioteca.readReferencias(materia.codigo, turma.id).arquivos;
	const nomeado = (a: (typeof refs)[number]) => ({ caminho: deps.biblioteca.referenciaPath(materia.codigo, turma.id, a.arquivo), titulo: a.titulo ?? a.arquivo });
	return { refs, nomeado };
};

function lerMateriaETurma(ref: UfjContextRef, deps: Pick<PreparacaoDeps, "biblioteca">): { materia: Materia; turma: Turma } {
	let materia: Materia | null;
	let turma: Turma | null;
	try {
		materia = deps.biblioteca.readMateria(ref.materia);
		turma = materia ? deps.biblioteca.readTurma(ref.materia, ref.turma) : null;
	} catch (err) {
		if (err instanceof BibliotecaFormatoError) throw err;
		throw new BibliotecaEntradaError(DESCONHECIDO);
	}
	if (!materia || !turma) throw new BibliotecaEntradaError(DESCONHECIDO);
	return { materia, turma };
}

/** Vínculo de material (spec chat+SIGAA §5.4): o arquivo em primeiro lugar; sem avaliação. */
function marcadorDeMaterial(ref: UfjContextRef, deps: PreparacaoDeps): LhMarkerMessage {
	const { materia, turma } = lerMateriaETurma(ref, deps);
	const { refs, nomeado } = NOMES_REF(deps, materia, turma);
	const arq = refs.find((a) => a.arquivo === ref.arquivo);
	if (!arq) throw new BibliotecaEntradaError("Material não encontrado.");
	const topicoId = ref.topico ?? arq.topicos[0];
	const topico = topicoId ? materia.topicos.find((t) => t.id === topicoId && !t.arquivado) : undefined;
	const aulas: Aula[] = topico ? turma.aulas.filter((a) => a.topicos.includes(topico.id)).sort((x, y) => x.ordem - y.ordem) : [];
	const outros = topico ? refs.filter((a) => a.arquivo !== arq.arquivo && a.topicos.includes(topico.id)).map(nomeado) : [];
	const content = composeUfjContextText({ materia, turma, ...(topico ? { topico } : {}), aulas, material: nomeado(arq), referencias: outros, dias: null, horas: null });
	const payload: UfjContextPayload = {
		materia: materia.codigo, turma: turma.id, origem: "material", arquivo: arq.arquivo,
		...(topico ? { topico: topico.id, topicoTitulo: topico.titulo } : {}),
		materiaNome: materia.nome, docente: turma.docente.nome, arquivoTitulo: arq.titulo ?? arq.arquivo,
	};
	return newUfjContextMessage(payload, content);
}

/** Vínculo de prova inteira (spec chat+SIGAA §5.4): todos os tópicos do escopo e seus arquivos. */
function marcadorDeProva(ref: UfjContextRef, deps: PreparacaoDeps): LhMarkerMessage {
	const { materia, turma } = lerMateriaETurma(ref, deps);
	const avaliacao = turma.avaliacoes.find((a) => a.id === ref.avaliacao);
	if (!avaliacao) throw new BibliotecaEntradaError(DESCONHECIDO);
	const { refs, nomeado } = NOMES_REF(deps, materia, turma);
	const topicos = avaliacao.escopo.topicos.map((id) => materia.topicos.find((t) => t.id === id && !t.arquivado)).filter((t): t is NonNullable<typeof t> => !!t);
	const topicosDaProva = topicos.map((t) => ({ titulo: t.titulo, datas: turma.aulas.filter((a) => a.topicos.includes(t.id) && a.data).sort((x, y) => x.ordem - y.ordem).map((a) => formatarDataCurta(a.data!)) }));
	const ids = new Set(topicos.map((t) => t.id));
	const referencias = refs.filter((a) => a.topicos.some((id) => ids.has(id))).map(nomeado);
	const dias = avaliacao.data && deps.diasAte ? deps.diasAte(avaliacao.data) : null;
	const horas = deps.estudo.readHoras(chaveHoras({ materia: materia.codigo, turma: turma.id, avaliacao: avaliacao.id }));
	const content = composeUfjContextText({ materia, turma, avaliacao, aulas: [], topicosDaProva, referencias, dias, horas });
	const payload: UfjContextPayload = {
		materia: materia.codigo, turma: turma.id, avaliacao: avaliacao.id, origem: "prova",
		materiaNome: materia.nome, docente: turma.docente.nome, avaliacaoNome: avaliacao.nome, ...(avaliacao.data ? { data: avaliacao.data } : {}),
	};
	return newUfjContextMessage(payload, content);
}

/** O marcador ufj-context de uma sessão criada pela biblioteca: por tópico (padrão), por material ou pela prova inteira. */
export function ufjMarkerFor(ref: UfjContextRef, deps: PreparacaoDeps = defaultDeps()): LhMarkerMessage {
	if (ref.origem === "material") return marcadorDeMaterial(ref, deps);
	if (ref.origem === "prova") return marcadorDeProva(ref, deps);
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
// Turmas do SIGAA não têm "Editar plano": o conteúdo vem das datas (spec SIGAA §7.6).
const SIGAA_SEM_DATA = "Defina a data desta prova para saber o que cai.";
const SIGAA_SEM_TOPICOS = "Ainda não há tópicos de aula antes desta prova. Marque o conteúdo em “Conteúdo da prova”, na página da matéria.";

/** A view da tela de preparação de uma avaliação (spec §7.5). */
export function preparacaoView(ref: { materia: string; turma: string; avaliacao: string }, hoje: Date, deps: PreparacaoDeps = defaultDeps()): PreparacaoView {
	let materia: Materia | null;
	let turma: Turma | null;
	try {
		materia = deps.biblioteca.readMateria(ref.materia);
		turma = materia ? deps.biblioteca.readTurma(ref.materia, ref.turma) : null;
	} catch (err) {
		if (err instanceof BibliotecaFormatoError) throw err; // a causa real, não "desconhecida"
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
		avisos: topicos.length > 0 ? [] : !turma.sigaa ? [SEM_ESCOPO] : avaliacao.data ? [SIGAA_SEM_TOPICOS] : [SIGAA_SEM_DATA],
		revisao: {
			ufjContext: { materia: materia.codigo, turma: turma.id, avaliacao: avaliacao.id, origem: "prova" },
			prompt: promptRevisao({ materia: materia.codigo, turma: turma.id, avaliacao: avaliacao.id, origem: "prova", materiaNome: materia.nome, docente: turma.docente.nome, avaliacaoNome: avaliacao.nome, ...(avaliacao.data ? { data: avaliacao.data } : {}) }),
		},
		revisoes: revisoesDaProva(deps.listChats(), { materia: materia.codigo, avaliacao: avaliacao.id }),
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
