/**
 * BIBLIOTECA UFJ — formato 1 (spec Etapa A §7.2).
 *
 * Os dados da biblioteca (matérias, turmas, referências) são arquivos JSON
 * compartilháveis na Etapa B. Este módulo é o contrato: tipos, validação na
 * leitura e na escrita, e os identificadores seguros para caminho. Fica no
 * barrel do navegador, então não importa nada de `node:*`.
 *
 * Regra dos tópicos (revisão da spec): os tópicos pertencem à MATÉRIA, com ids
 * imutáveis; a turma só liga as suas aulas a eles (`Aula.topicos`).
 */

export const FORMATO_BIBLIOTECA = 1;

export interface Topico {
	/** slug imutável depois de criado, ex. "teorema-do-valor-medio" */
	id: string;
	titulo: string;
	descricao?: string;
	/** prompt curado; ausente = gerado pelo modelo de prompts */
	prompt?: string;
	/** saiu do plano mas ainda é citado por turmas ou sessões */
	arquivado?: boolean;
}

export interface Materia {
	formato: 1;
	codigo: string;
	nome: string;
	curso: string;
	unidade: string;
	ementa: string;
	objetivos: { geral: string[]; especificos: string[] };
	bibliografia: { basica: string[]; complementar: string[]; virtual: string[] };
	topicos: Topico[];
}

export interface Aula {
	ordem: number;
	rotulo: string;
	/** AAAA-MM-DD */
	data?: string;
	ch?: number;
	conteudo: string;
	estrategias?: string;
	avaliacaoId?: string;
	/** ids de Topico da matéria; vazio em aulas de avaliação ou exercícios */
	topicos: string[];
}

export const TIPOS_AVALIACAO = [
	"prova-escrita",
	"prova-pratica",
	"substitutiva",
	"recuperacao",
	"trabalho",
	"apresentacao",
	"lista",
	"outra",
] as const;
export type TipoAvaliacao = (typeof TIPOS_AVALIACAO)[number];

/** Tipos que ganham tela de preparação (só provas). */
export const TIPOS_COM_ESCOPO = ["prova-escrita", "prova-pratica", "substitutiva", "recuperacao"] as const;

export interface Avaliacao {
	id: string;
	nome: string;
	tipo: TipoAvaliacao;
	/** 1ª, 2ª, 3ª prova regular */
	posicao?: number;
	data?: string;
	pontos?: number;
	duracaoMin?: number;
	peso?: string;
	escopo: { topicos: string[] };
	observacoes?: string;
}

export interface Turma {
	formato: 1;
	id: string;
	semestre: string;
	docente: { nome: string; slug: string };
	turno?: string;
	chTeorica?: number;
	chPratica?: number;
	aulas: Aula[];
	avaliacoes: Avaliacao[];
	criteriosMedia: string;
	recuperacao?: string;
	metodologia?: string;
	importadoEm: string;
	revisadoEm: string;
}

export interface Referencias {
	formato: 1;
	arquivos: { arquivo: string; titulo?: string; topicos: string[]; sha256: string }[];
}

/** Arquivo da biblioteca com formato mais novo que este app. */
export class BibliotecaFormatoError extends Error {
	constructor(message = "Este arquivo da biblioteca é de um formato mais novo que este app.") {
		super(message);
		this.name = "BibliotecaFormatoError";
	}
}

/** Dado inválido vindo do usuário, do modelo ou do disco (mensagem em português). */
export class BibliotecaEntradaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BibliotecaEntradaError";
	}
}

/** A turma já existe e o pedido não autorizou substituir. */
export class BibliotecaConflitoError extends Error {
	readonly code = "turma_existe";
	constructor(message = "Esta turma já existe na biblioteca.") {
		super(message);
		this.name = "BibliotecaConflitoError";
	}
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CODIGO_RE = /^[A-Z0-9]{3,12}$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export function slugify(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60)
		.replace(/-+$/g, "");
}

export function isValidCodigo(codigo: string): boolean {
	return CODIGO_RE.test(codigo);
}

export function isValidSlug(slug: string): boolean {
	return slug.length <= 80 && SLUG_RE.test(slug);
}

/** Id de turma: semestre e docente, ex. "2026-2-prof-exemplo". */
export function turmaId(semestre: string, docenteSlug: string): string {
	return `${semestre}-${docenteSlug}`;
}

/** Nome de arquivo seguro dentro de uma pasta da biblioteca. */
export function isValidNomeArquivo(nome: string): boolean {
	return (
		nome.length > 0 &&
		nome.length <= 200 &&
		!nome.startsWith(".") &&
		!nome.includes("/") &&
		!nome.includes("\\") &&
		!nome.includes("\0") &&
		nome.trim() === nome
	);
}

// ─── validação ───────────────────────────────────────────────────────────────

const fail = (onde: string, detalhe: string): never => {
	throw new BibliotecaEntradaError(`${onde}: ${detalhe}`);
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function str(r: Record<string, unknown>, k: string, onde: string): string {
	const v = r[k];
	if (typeof v !== "string") return fail(onde, `o campo "${k}" precisa ser um texto`);
	return v;
}

function optStr(r: Record<string, unknown>, k: string, onde: string): string | undefined {
	const v = r[k];
	if (v === undefined) return undefined;
	if (typeof v !== "string") return fail(onde, `o campo "${k}" precisa ser um texto`);
	return v;
}

function optNum(r: Record<string, unknown>, k: string, onde: string): number | undefined {
	const v = r[k];
	if (v === undefined) return undefined;
	if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return fail(onde, `o campo "${k}" precisa ser um número não negativo`);
	return v;
}

function strList(v: unknown, onde: string): string[] {
	if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return fail(onde, "precisa ser uma lista de textos");
	return [...(v as string[])];
}

function optData(r: Record<string, unknown>, k: string, onde: string): string | undefined {
	const v = optStr(r, k, onde);
	if (v !== undefined && !DATA_RE.test(v)) return fail(onde, `o campo "${k}" precisa estar no formato AAAA-MM-DD`);
	return v;
}

function slugList(v: unknown, onde: string): string[] {
	const list = strList(v, onde);
	for (const s of list) if (!isValidSlug(s)) fail(onde, `"${s}" não é um id de tópico válido`);
	return list;
}

function checkFormato(r: Record<string, unknown>, onde: string): 1 {
	const f = r.formato;
	if (typeof f === "number" && Number.isInteger(f) && f > FORMATO_BIBLIOTECA) throw new BibliotecaFormatoError();
	if (f !== FORMATO_BIBLIOTECA) return fail(onde, "formato desconhecido");
	return 1;
}

function parseTopico(raw: unknown, onde: string): Topico {
	if (!isObj(raw)) return fail(onde, "tópico inválido");
	const id = str(raw, "id", onde);
	if (!isValidSlug(id)) fail(onde, `"${id}" não é um id de tópico válido`);
	const titulo = str(raw, "titulo", onde).trim();
	if (!titulo) fail(onde, `o tópico "${id}" está sem título`);
	const t: Topico = { id, titulo };
	const descricao = optStr(raw, "descricao", onde);
	if (descricao !== undefined) t.descricao = descricao;
	const prompt = optStr(raw, "prompt", onde);
	if (prompt !== undefined) t.prompt = prompt;
	if (raw.arquivado !== undefined) {
		if (typeof raw.arquivado !== "boolean") fail(onde, `o campo "arquivado" do tópico "${id}" precisa ser verdadeiro ou falso`);
		if (raw.arquivado) t.arquivado = true;
	}
	return t;
}

export function parseMateria(raw: unknown): Materia {
	const onde = "Matéria";
	if (!isObj(raw)) return fail(onde, "conteúdo inválido");
	checkFormato(raw, onde);
	const codigo = str(raw, "codigo", onde);
	if (!isValidCodigo(codigo)) fail(onde, `"${codigo}" não é um código de disciplina válido`);
	const objetivos = raw.objetivos;
	const bibliografia = raw.bibliografia;
	if (!isObj(objetivos)) return fail(onde, "objetivos inválidos");
	if (!isObj(bibliografia)) return fail(onde, "bibliografia inválida");
	if (!Array.isArray(raw.topicos)) return fail(onde, "a lista de tópicos é obrigatória");
	const topicos = raw.topicos.map((t) => parseTopico(t, onde));
	const ids = new Set<string>();
	for (const t of topicos) {
		if (ids.has(t.id)) fail(onde, `id de tópico repetido: "${t.id}"`);
		ids.add(t.id);
	}
	return {
		formato: 1,
		codigo,
		nome: str(raw, "nome", onde),
		curso: str(raw, "curso", onde),
		unidade: str(raw, "unidade", onde),
		ementa: str(raw, "ementa", onde),
		objetivos: { geral: strList(objetivos.geral, `${onde} (objetivo geral)`), especificos: strList(objetivos.especificos, `${onde} (objetivos específicos)`) },
		bibliografia: {
			basica: strList(bibliografia.basica, `${onde} (bibliografia básica)`),
			complementar: strList(bibliografia.complementar, `${onde} (bibliografia complementar)`),
			virtual: strList(bibliografia.virtual, `${onde} (bibliografia virtual)`),
		},
		topicos,
	};
}

function parseAula(raw: unknown, onde: string): Aula {
	if (!isObj(raw)) return fail(onde, "aula inválida");
	const ordem = raw.ordem;
	if (typeof ordem !== "number" || !Number.isInteger(ordem) || ordem < 1) return fail(onde, "toda aula precisa de uma ordem inteira a partir de 1");
	const a: Aula = { ordem, rotulo: str(raw, "rotulo", onde), conteudo: str(raw, "conteudo", onde), topicos: slugList(raw.topicos, `${onde} (tópicos da aula ${ordem})`) };
	const data = optData(raw, "data", onde);
	if (data !== undefined) a.data = data;
	const ch = optNum(raw, "ch", onde);
	if (ch !== undefined) a.ch = ch;
	const estrategias = optStr(raw, "estrategias", onde);
	if (estrategias !== undefined) a.estrategias = estrategias;
	const avaliacaoId = optStr(raw, "avaliacaoId", onde);
	if (avaliacaoId !== undefined) a.avaliacaoId = avaliacaoId;
	return a;
}

function parseAvaliacao(raw: unknown, onde: string): Avaliacao {
	if (!isObj(raw)) return fail(onde, "avaliação inválida");
	const id = str(raw, "id", onde).trim();
	if (!id) fail(onde, "toda avaliação precisa de um id");
	const tipo = str(raw, "tipo", onde);
	if (!(TIPOS_AVALIACAO as readonly string[]).includes(tipo)) fail(onde, `tipo de avaliação desconhecido: "${tipo}"`);
	const escopo = raw.escopo;
	if (!isObj(escopo)) return fail(onde, `a avaliação "${id}" está sem escopo`);
	const av: Avaliacao = { id, nome: str(raw, "nome", onde), tipo: tipo as TipoAvaliacao, escopo: { topicos: slugList(escopo.topicos, `${onde} (escopo de ${id})`) } };
	const posicao = optNum(raw, "posicao", onde);
	if (posicao !== undefined) av.posicao = posicao;
	const data = optData(raw, "data", onde);
	if (data !== undefined) av.data = data;
	const pontos = optNum(raw, "pontos", onde);
	if (pontos !== undefined) av.pontos = pontos;
	const duracaoMin = optNum(raw, "duracaoMin", onde);
	if (duracaoMin !== undefined) av.duracaoMin = duracaoMin;
	const peso = optStr(raw, "peso", onde);
	if (peso !== undefined) av.peso = peso;
	const observacoes = optStr(raw, "observacoes", onde);
	if (observacoes !== undefined) av.observacoes = observacoes;
	return av;
}

export function parseTurma(raw: unknown): Turma {
	const onde = "Turma";
	if (!isObj(raw)) return fail(onde, "conteúdo inválido");
	checkFormato(raw, onde);
	const id = str(raw, "id", onde);
	if (!isValidSlug(id)) fail(onde, `"${id}" não é um id de turma válido`);
	const docente = raw.docente;
	if (!isObj(docente)) return fail(onde, "docente inválido");
	const docenteSlug = str(docente, "slug", onde);
	if (!isValidSlug(docenteSlug)) fail(onde, `"${docenteSlug}" não é um id de docente válido`);
	if (!Array.isArray(raw.aulas)) return fail(onde, "a lista de aulas é obrigatória");
	if (!Array.isArray(raw.avaliacoes)) return fail(onde, "a lista de avaliações é obrigatória");
	const avaliacoes = raw.avaliacoes.map((a) => parseAvaliacao(a, onde));
	const ids = new Set<string>();
	for (const a of avaliacoes) {
		if (ids.has(a.id)) fail(onde, `id de avaliação repetido: "${a.id}"`);
		ids.add(a.id);
	}
	const t: Turma = {
		formato: 1,
		id,
		semestre: str(raw, "semestre", onde),
		docente: { nome: str(docente, "nome", onde), slug: docenteSlug },
		aulas: raw.aulas.map((a) => parseAula(a, onde)),
		avaliacoes,
		criteriosMedia: str(raw, "criteriosMedia", onde),
		importadoEm: str(raw, "importadoEm", onde),
		revisadoEm: str(raw, "revisadoEm", onde),
	};
	const turno = optStr(raw, "turno", onde);
	if (turno !== undefined) t.turno = turno;
	const chTeorica = optNum(raw, "chTeorica", onde);
	if (chTeorica !== undefined) t.chTeorica = chTeorica;
	const chPratica = optNum(raw, "chPratica", onde);
	if (chPratica !== undefined) t.chPratica = chPratica;
	const recuperacao = optStr(raw, "recuperacao", onde);
	if (recuperacao !== undefined) t.recuperacao = recuperacao;
	const metodologia = optStr(raw, "metodologia", onde);
	if (metodologia !== undefined) t.metodologia = metodologia;
	return t;
}

export function parseReferencias(raw: unknown): Referencias {
	const onde = "Referências";
	if (!isObj(raw)) return fail(onde, "conteúdo inválido");
	checkFormato(raw, onde);
	if (!Array.isArray(raw.arquivos)) return fail(onde, "a lista de arquivos é obrigatória");
	const vistos = new Set<string>();
	const arquivos = raw.arquivos.map((x) => {
		if (!isObj(x)) return fail(onde, "arquivo inválido");
		const arquivo = str(x, "arquivo", onde);
		if (!isValidNomeArquivo(arquivo)) fail(onde, `nome de arquivo inválido: "${arquivo}"`);
		if (vistos.has(arquivo)) fail(onde, `arquivo repetido: "${arquivo}"`);
		vistos.add(arquivo);
		const sha256 = str(x, "sha256", onde);
		if (!SHA256_RE.test(sha256)) fail(onde, `sha256 inválido para "${arquivo}"`);
		const entry: Referencias["arquivos"][number] = { arquivo, topicos: slugList(x.topicos, `${onde} (${arquivo})`), sha256 };
		const titulo = optStr(x, "titulo", onde);
		if (titulo !== undefined) entry.titulo = titulo;
		return entry;
	});
	return { formato: 1, arquivos };
}
