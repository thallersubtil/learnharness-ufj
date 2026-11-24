/**
 * MATÉRIAS MONTADAS PELO SIGAA (spec SIGAA §7.4–7.6).
 *
 * O leitor do servidor (`src/server/sigaa/`) devolve uma `SigaaTurmaLida`;
 * `montarDoSigaa` transforma isso na `Materia`, na `Turma` e nas `Referencias`
 * que o resto do app já usa (preparação, marcador ufj-context, Aprender e
 * Praticar). Tudo aqui é puro e determinístico.
 */

import {
	parseMateria,
	parseReferencias,
	parseTurma,
	slugify,
	type Aula,
	type Avaliacao,
	type Materia,
	type Referencias,
	type Topico,
	type Turma,
} from "./biblioteca.ts";
import { recalcularTurma } from "./biblioteca-escopo.ts";
import { formatarDataCurta } from "./ufj-context.ts";

/** Os formatos que a IA lê; o resto é baixado e só listado (spec SIGAA §7.8). */
export const EXTENSOES_LIDAS_PELA_IA = [".pdf", ".ipynb", ".md", ".txt", ".c", ".h", ".py", ".java", ".png", ".jpg", ".jpeg"] as const;

export interface SigaaArquivo {
	sigaaId: string;
	titulo: string;
	descricao: string;
	/** O título do tópico de aula em que o professor pôs o arquivo. */
	topicoDeAula: string;
}

export interface SigaaTopicoDeAula {
	titulo: string;
	/** AAAA-MM-DD */
	inicio?: string;
	/** AAAA-MM-DD */
	fim?: string;
	descricao: string;
}

export interface SigaaAvaliacao {
	sigaaId: string;
	/** AAAA-MM-DD */
	data: string;
	/** Como veio do SIGAA; só vale se for HH:MM. */
	hora?: string;
	descricao: string;
}

export interface SigaaTurmaLida {
	idTurma: string;
	codigo: string;
	nome: string;
	/** "2026-2" */
	semestre: string;
	/** "TA" */
	sufixo?: string;
	docente?: string;
	topicos: SigaaTopicoDeAula[];
	avaliacoes: SigaaAvaliacao[];
	arquivos: SigaaArquivo[];
}

export interface Montagem {
	materia: Materia;
	turma: Turma;
	referencias: Referencias;
	avisos: string[];
}

// ─── títulos ─────────────────────────────────────────────────────────────────

/** Sem acentos, minúsculas, espaços colapsados, sem pontuação no fim. */
export function normalizarTitulo(s: string): string {
	return s
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.;:,!?]+$/, "")
		.trim();
}

const CONECTIVOS = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "em", "para", "com"]);
const ROMANOS = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

/** "PROGRAMAÇÃO ORIENTADA A OBJETOS" → "Programação Orientada a Objetos". */
export function nomeDeDisciplina(s: string): string {
	return s
		.trim()
		.split(/\s+/)
		.map((palavra, i) => {
			const p = palavra.toLocaleLowerCase("pt-BR");
			if (ROMANOS.test(p)) return p.toUpperCase();
			if (i > 0 && CONECTIVOS.has(p)) return p;
			return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
		})
		.join(" ");
}

/** O tópico de aula é uma prova ("Avaliação da aprendizagem", "2ª prova", "N2"). */
export function ehTopicoDeProva(titulo: string): boolean {
	const n = normalizarTitulo(titulo);
	return /^(\d+\s*[ao]?\s*)?(prova|avaliacao|exame)\b/.test(n) || /^(n|av)[1-4]\b/.test(n);
}

/** "Não Haverá Aula". */
export function ehAulaCancelada(titulo: string): boolean {
	return normalizarTitulo(titulo).startsWith("nao havera aula");
}

/** Id da turma do SIGAA: "2026-2-turma-ta", ou "2026-2-sigaa" sem sufixo. */
export function idTurmaSigaa(semestre: string, sufixo?: string): string {
	const s = sufixo ? slugify(sufixo) : "";
	return s ? `${semestre}-turma-${s}` : `${semestre}-sigaa`;
}

const extensao = (nome: string) => {
	const i = nome.lastIndexOf(".");
	return i < 0 ? "" : nome.slice(i).toLowerCase();
};

// ─── montagem ────────────────────────────────────────────────────────────────

interface TopicoAnterior {
	norm: string;
	indice: number;
	inicio?: string;
	fim?: string;
	id: string;
}

/** Ids dos tópicos de estudo, um por tópico de aula (null para prova e aula cancelada). */
function idsDosTopicos(lida: SigaaTurmaLida, turmaAnterior: Turma | null, materia: Materia): (string | null)[] {
	const anteriores: TopicoAnterior[] = (turmaAnterior?.aulas ?? [])
		.filter((a) => a.sigaa && a.topicos.length > 0)
		.map((a) => ({ norm: normalizarTitulo(a.sigaa!.titulo), indice: a.ordem - 1, inicio: a.data, fim: a.sigaa!.fim, id: a.topicos[0]! }));
	const normsNovos = new Set(lida.topicos.map((t) => normalizarTitulo(t.titulo)));
	const usados = new Set<string>();
	const ocupados = new Set(materia.topicos.map((t) => t.id));
	return lida.topicos.map((t, i) => {
		if (ehTopicoDeProva(t.titulo) || ehAulaCancelada(t.titulo)) return null;
		const norm = normalizarTitulo(t.titulo);
		// 1. Mesmo título: mesmo tópico, mesmo que o período mude.
		let achado = anteriores.find((a) => a.norm === norm && !usados.has(a.id));
		// 2. Título novo no lugar de um que sumiu, com o mesmo período: renomeado.
		achado ??= anteriores.find((a) => a.indice === i && a.inicio === t.inicio && a.fim === t.fim && !normsNovos.has(a.norm) && !usados.has(a.id));
		if (achado) {
			usados.add(achado.id);
			return achado.id;
		}
		// 3. Tópico novo.
		const base = slugify(t.titulo.normalize("NFKD")) || "topico";
		let id = base;
		for (let n = 2; ocupados.has(id) || usados.has(id); n++) id = `${base}-${n}`;
		usados.add(id);
		ocupados.add(id);
		return id;
	});
}

function materiaNova(lida: SigaaTurmaLida): Materia {
	return {
		formato: 1,
		codigo: lida.codigo,
		nome: nomeDeDisciplina(lida.nome),
		curso: "",
		unidade: "",
		ementa: "",
		objetivos: { geral: [], especificos: [] },
		bibliografia: { basica: [], complementar: [], virtual: [] },
		topicos: [],
	};
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function mesclarAvaliacoes(lida: SigaaTurmaLida, anteriores: readonly Avaliacao[], avisos: string[]): Avaliacao[] {
	const vindas = new Map(lida.avaliacoes.map((a) => [a.sigaaId, a]));
	const out: Avaliacao[] = anteriores.map((av) => {
		if (!av.sigaaId) return av;
		const sa = vindas.get(av.sigaaId);
		if (!sa) {
			// Sumiu do SIGAA: fica com a última data, agora como "à mão".
			const { sigaaId: _s, ...resto } = av;
			return { ...resto, ...(resto.data ? { origemData: "manual" as const } : {}) };
		}
		vindas.delete(av.sigaaId);
		const nome = sa.descricao.trim() || av.nome;
		if (av.data && av.data !== sa.data) avisos.push(`O SIGAA mudou a ${nome} de ${formatarDataCurta(av.data)} para ${formatarDataCurta(sa.data)}.`);
		const { hora: _h, ...resto } = av;
		return { ...resto, nome, data: sa.data, origemData: "sigaa", ...(sa.hora && HORA_RE.test(sa.hora) ? { hora: sa.hora } : {}) };
	});
	for (const sa of vindas.values()) {
		out.push({
			id: `sigaa-${sa.sigaaId}`,
			nome: sa.descricao.trim() || "Prova",
			tipo: "prova-escrita",
			data: sa.data,
			origemData: "sigaa",
			sigaaId: sa.sigaaId,
			...(sa.hora && HORA_RE.test(sa.hora) ? { hora: sa.hora } : {}),
			escopo: { topicos: [] },
		});
	}
	return out;
}

export function montarDoSigaa(
	lida: SigaaTurmaLida,
	anterior: { materia: Materia | null; turma: Turma | null; referencias: Referencias },
	agora: string,
): Montagem {
	const avisos: string[] = [];
	const base = anterior.materia ?? materiaNova(lida);
	const ids = idsDosTopicos(lida, anterior.turma, base);

	// Tópicos de estudo: os desta turma entram (ou são atualizados); os que
	// eram desta turma e sumiram do SIGAA ficam arquivados; os de outras
	// turmas da matéria não mudam.
	const destaTurmaAntes = new Set((anterior.turma?.aulas ?? []).flatMap((a) => a.topicos));
	const atuais = new Map<string, string>();
	lida.topicos.forEach((t, i) => {
		const id = ids[i];
		if (id) atuais.set(id, t.titulo.trim());
	});
	const topicos: Topico[] = base.topicos.map((t) => {
		const titulo = atuais.get(t.id);
		if (titulo !== undefined) {
			const { arquivado: _a, ...resto } = t;
			return { ...resto, titulo };
		}
		if (destaTurmaAntes.has(t.id)) return { ...t, arquivado: true };
		return t;
	});
	for (const [id, titulo] of atuais) if (!topicos.some((t) => t.id === id)) topicos.push({ id, titulo });
	const materia: Materia = { ...base, topicos };

	const aulas: Aula[] = lida.topicos.map((t, i) => {
		const prova = ehTopicoDeProva(t.titulo);
		const cancelada = ehAulaCancelada(t.titulo);
		const descricao = t.descricao.trim();
		return {
			ordem: i + 1,
			rotulo: String(i + 1),
			...(t.inicio ? { data: t.inicio } : {}),
			conteudo: descricao ? `${t.titulo.trim()} — ${descricao}` : t.titulo.trim(),
			topicos: ids[i] ? [ids[i]!] : [],
			sigaa: { titulo: t.titulo.trim(), ...(t.fim ? { fim: t.fim } : {}), ...(prova ? { prova: true as const } : {}), ...(cancelada ? { cancelada: true as const } : {}) },
		};
	});

	const avaliacoes = mesclarAvaliacoes(lida, anterior.turma?.avaliacoes ?? [], avisos);
	for (const aula of aulas) {
		if (!aula.sigaa?.prova || !aula.data) continue;
		const ligada = avaliacoes.find((a) => a.data === aula.data && (a.tipo === "prova-escrita" || a.tipo === "prova-pratica"));
		if (ligada) aula.avaliacaoId = ligada.id;
	}

	const t0 = anterior.turma;
	const turma = recalcularTurma({
		...(t0 ?? {}),
		formato: 1,
		id: idTurmaSigaa(lida.semestre, lida.sufixo),
		semestre: lida.semestre,
		docente: { nome: lida.docente ?? t0?.docente.nome ?? "", slug: "sigaa" },
		aulas,
		avaliacoes,
		criteriosMedia: t0?.criteriosMedia ?? "",
		importadoEm: t0?.importadoEm ?? agora,
		revisadoEm: agora,
		sigaa: { idTurma: lida.idTurma, ...(lida.sufixo ? { sufixo: lida.sufixo } : {}), sincronizadoEm: agora },
	});

	// Provas futuras que ganharam tópicos com esta leitura.
	const hoje = agora.slice(0, 10);
	for (const av of turma.avaliacoes) {
		const antes = t0?.avaliacoes.find((a) => a.id === av.id);
		if (!antes || !av.data || av.data < hoje) continue;
		const novos = av.escopo.topicos.filter((id) => !antes.escopo.topicos.includes(id));
		if (novos.length) avisos.push(`A ${av.nome} passou a incluir: ${novos.map((id) => materia.topicos.find((t) => t.id === id)?.titulo ?? id).join(", ")}.`);
	}

	// Arquivos: ligados ao tópico de estudo do tópico de aula do professor.
	const porId = new Map(lida.arquivos.map((a) => [a.sigaaId, a]));
	const referencias: Referencias = {
		formato: 1,
		arquivos: anterior.referencias.arquivos.map((r) => {
			const arq = r.sigaaId ? porId.get(r.sigaaId) : undefined;
			if (!arq) return r;
			const i = lida.topicos.findIndex((t) => normalizarTitulo(t.titulo) === normalizarTitulo(arq.topicoDeAula));
			const lido = (EXTENSOES_LIDAS_PELA_IA as readonly string[]).includes(extensao(r.arquivo));
			const { aula: _a, ...resto } = r;
			return {
				...resto,
				titulo: arq.titulo,
				topicos: i >= 0 && ids[i] && lido ? [ids[i]!] : [],
				...(i >= 0 ? { aula: i + 1 } : {}),
			};
		}),
	};

	return { materia: parseMateria(materia), turma: parseTurma(turma), referencias: parseReferencias(referencias), avisos };
}
