/**
 * ESCOPO DAS AVALIAÇÕES E TÓPICOS ESTÁVEIS (spec Etapa A §7.2–7.3).
 *
 * Tudo aqui é determinístico: o modelo propõe a estrutura do plano, e estas
 * funções calculam o que cai em cada prova, numeram as provas regulares e
 * garantem que um id de tópico, uma vez criado, nunca muda.
 */

import { slugify, type Aula, type Avaliacao, type Topico, type Turma } from "./biblioteca.ts";

const REGULARES = new Set<Avaliacao["tipo"]>(["prova-escrita", "prova-pratica"]);
const COBRE_TUDO = new Set<Avaliacao["tipo"]>(["substitutiva", "recuperacao"]);

/**
 * Posição de uma avaliação no cronograma, comparável com `Aula.ordem`:
 * - a aula marcada com `avaliacaoId` dá a posição exata (essa aula fica fora
 *   do escopo, porque é a própria prova);
 * - sem aula marcada, a última aula com data até a data da prova, mais meio
 *   ponto (essa aula entra no escopo: é conteúdo dado até o dia da prova);
 * - sem nenhuma das duas, a posição é desconhecida.
 */
function posicaoNoCronograma(av: Avaliacao, aulas: readonly Aula[]): number | null {
	const marcada = aulas.find((a) => a.avaliacaoId === av.id);
	if (marcada) return marcada.ordem;
	if (av.data) {
		let ultima: Aula | undefined;
		for (const a of aulas) if (a.data && a.data <= av.data && (!ultima || a.ordem > ultima.ordem)) ultima = a;
		if (ultima) return ultima.ordem + 0.5;
	}
	return null;
}

function topicosEntre(aulas: readonly Aula[], depoisDe: number, antesDe: number): string[] {
	const out: string[] = [];
	for (const a of [...aulas].sort((x, y) => x.ordem - y.ordem)) {
		if (a.ordem <= depoisDe || a.ordem >= antesDe) continue;
		for (const t of a.topicos) if (!out.includes(t)) out.push(t);
	}
	return out;
}

/** Numera 1, 2, 3… as provas regulares pela posição no cronograma. A ordem da lista não muda. */
export function computePosicoes(avaliacoes: readonly Avaliacao[], aulas: readonly Aula[]): Avaliacao[] {
	const regulares = avaliacoes
		.filter((a) => REGULARES.has(a.tipo))
		.map((a) => ({ id: a.id, pos: posicaoNoCronograma(a, aulas) }))
		.filter((x): x is { id: string; pos: number } => x.pos !== null)
		.sort((x, y) => x.pos - y.pos);
	const numero = new Map(regulares.map((x, i) => [x.id, i + 1]));
	return avaliacoes.map((a) => {
		const { posicao: _antiga, ...resto } = a;
		const n = numero.get(a.id);
		return n === undefined ? resto : { ...resto, posicao: n };
	});
}

/** Calcula o escopo de cada avaliação a partir do cronograma (spec §7.3, passo 3). */
export function computeEscopos(avaliacoes: readonly Avaliacao[], aulas: readonly Aula[]): { avaliacoes: Avaliacao[]; avisos: string[] } {
	const avisos: string[] = [];
	const regulares = avaliacoes
		.filter((a) => REGULARES.has(a.tipo))
		.map((a) => ({ id: a.id, pos: posicaoNoCronograma(a, aulas) }))
		.filter((x): x is { id: string; pos: number } => x.pos !== null)
		.sort((x, y) => x.pos - y.pos);
	const todos = topicosEntre(aulas, -Infinity, Infinity);
	// Aulas que são provas no SIGAA ("Avaliação da aprendizagem") também
	// encerram o escopo da prova seguinte, mesmo sem prova do app ligada a elas.
	const limites = aulas.filter((a) => a.sigaa?.prova).map((a) => a.ordem);
	const out = avaliacoes.map((a): Avaliacao => {
		if (COBRE_TUDO.has(a.tipo)) return { ...a, escopo: { topicos: todos } };
		if (!REGULARES.has(a.tipo)) return { ...a, escopo: { topicos: [] } };
		const i = regulares.findIndex((x) => x.id === a.id);
		if (i < 0) {
			avisos.push(`A avaliação ${a.id} não tem data nem aula no cronograma: defina o escopo à mão.`);
			return { ...a, escopo: { topicos: [] } };
		}
		const pos = regulares[i]!.pos;
		const anterior = Math.max(-Infinity, ...regulares.slice(0, i).map((x) => x.pos), ...limites.filter((p) => p < pos));
		return { ...a, escopo: { topicos: topicosEntre(aulas, anterior, pos) } };
	});
	return { avaliacoes: out, avisos };
}

/** Tira o que o aluno excluiu e acrescenta, no fim, o que ele incluiu. */
export function aplicarEscopoManual(calculado: string[], manual?: Avaliacao["escopoManual"]): string[] {
	if (!manual) return calculado;
	const fora = new Set(manual.excluidos);
	const out = calculado.filter((t) => !fora.has(t));
	for (const t of manual.incluidos) if (!out.includes(t)) out.push(t);
	return out;
}

/** Numera as provas e recalcula os escopos de uma turma do SIGAA (spec SIGAA §7.6).
 *  Turma sem `sigaa` (plano importado) volta igual: lá o escopo é escolhido à mão. */
export function recalcularTurma(turma: Turma): Turma {
	if (!turma.sigaa) return turma;
	const numeradas = computePosicoes(turma.avaliacoes, turma.aulas);
	const { avaliacoes } = computeEscopos(numeradas, turma.aulas);
	return { ...turma, avaliacoes: avaliacoes.map((a) => ({ ...a, escopo: { topicos: aplicarEscopoManual(a.escopo.topicos, a.escopoManual) } })) };
}

export interface TopicoProposto {
	ref: string;
	titulo: string;
	descricao?: string;
	existente: boolean;
}

/**
 * Junta os tópicos propostos pelo modelo com os que a matéria já tem:
 * - existente reaproveitado: mantém id e título (renomear é decisão do dono,
 *   não da importação) e deixa de estar arquivado;
 * - novo: id = slugify(título), com sufixo -2, -3… em caso de colisão;
 * - os existentes não citados continuam como estão.
 */
export function reconcileTopicos(
	existentes: readonly Topico[],
	propostos: readonly TopicoProposto[],
	aulas: readonly { topicos: readonly string[] }[],
): { topicos: Topico[]; aulas: string[][]; erros: string[] } {
	const erros: string[] = [];
	const topicos: Topico[] = existentes.map((t) => ({ ...t }));
	const usados = new Set(topicos.map((t) => t.id));
	const final = new Map<string, string>();
	const jaApontados = new Set<string>();
	for (const p of propostos) {
		if (p.existente) {
			const t = topicos.find((x) => x.id === p.ref);
			if (!t) {
				erros.push(`O tópico existente "${p.ref}" não está na matéria.`);
				jaApontados.add(p.ref);
				continue;
			}
			delete t.arquivado;
			final.set(p.ref, t.id);
			continue;
		}
		const base = slugify(p.titulo) || "topico";
		let id = base;
		for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
		usados.add(id);
		const novo: Topico = { id, titulo: p.titulo.trim() };
		if (p.descricao) novo.descricao = p.descricao;
		topicos.push(novo);
		final.set(p.ref, id);
	}
	const aulasOut = aulas.map((a) =>
		a.topicos.flatMap((ref) => {
			const id = final.get(ref);
			if (id) return [id];
			if (!jaApontados.has(ref)) {
				erros.push(`Uma aula cita o tópico "${ref}", que não está na lista de tópicos.`);
				jaApontados.add(ref);
			}
			return [];
		}),
	);
	return { topicos, aulas: aulasOut, erros };
}

/** Ids de tópico citados por turmas (aulas e escopos) e por sessões. */
export function topicosReferenciados(turmas: readonly Turma[], refsDeSessoes: readonly string[]): Set<string> {
	const out = new Set<string>(refsDeSessoes);
	for (const t of turmas) {
		for (const a of t.aulas) for (const id of a.topicos) out.add(id);
		for (const av of t.avaliacoes) for (const id of av.escopo.topicos) out.add(id);
	}
	return out;
}

/** Um tópico que sumiu da edição mas ainda é citado volta como arquivado. Ids nunca mudam. */
export function arquivarRemovidos(antes: readonly Topico[], depois: readonly Topico[], referenciados: ReadonlySet<string>): Topico[] {
	const ficam = new Set(depois.map((t) => t.id));
	const arquivados = antes.filter((t) => !ficam.has(t.id) && referenciados.has(t.id)).map((t) => ({ ...t, arquivado: true }));
	return [...depois.map((t) => ({ ...t })), ...arquivados];
}
