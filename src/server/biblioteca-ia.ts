/**
 * CHAMADAS DE MODELO DA BIBLIOTECA UFJ (spec Etapa A §7.3–7.4).
 *
 * Cada operação é UMA chamada com uma ferramenta de envio (runSubmitAgent):
 * o modelo propõe, o código valida e calcula o que é determinístico (escopo,
 * posições, ids de tópico), e o resultado volta como RASCUNHO. Nada aqui grava
 * na biblioteca — quem grava é o serviço da biblioteca, depois da revisão do
 * dono. O uso de cada chamada vai para estudo/uso.jsonl.
 *
 * Os prompts e as descrições das ferramentas são em português (o app não tem
 * nada em inglês para o modelo nem para o aluno).
 */

import { Type } from "typebox";
import type { Usage } from "@earendil-works/pi-ai";
import type { PiEngine } from "../agent/models.ts";
import { piEngineForSpec } from "../agent/models.ts";
import { runSubmitAgent } from "../agent/subagents/submit-agent.ts";
import { callUsage } from "../agent/subagents/extraction.ts";
import { convertPdf } from "../agent/subagents/pdf-ops.ts";
import { joinPages } from "../agent/subagents/pdf-markdown.ts";
import { isSubscriptionProvider } from "../agent/subscription-connections.ts";
import type { CallUsage } from "../core/contracts.ts";
import type { BibliotecaStore, EstudoStore, UsoBiblioteca } from "../core/ports.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { ModelsNotConfiguredError, ProviderKeyMissingError } from "../core/settings.ts";
import {
	BibliotecaEntradaError,
	FORMATO_BIBLIOTECA,
	TIPOS_AVALIACAO,
	isValidCodigo,
	slugify,
	turmaId,
	type Aula,
	type Avaliacao,
	type Materia,
	type TipoAvaliacao,
	type Turma,
} from "../core/biblioteca.ts";
import { computeEscopos, computePosicoes, reconcileTopicos } from "../core/biblioteca-escopo.ts";
import { callCost } from "./pricing.ts";
import { providerKeyPresent } from "./keys.ts";
import { refreshConnectionCatalog } from "./model-catalog.ts";
import { stores } from "./stores.ts";

// ─── prompts (texto exato do plano da fatia 1) ───────────────────────────────

export const PLANO_SYSTEM_PROMPT = `Você extrai a estrutura de um plano de ensino da UFJ (Universidade Federal de Jataí) a partir do texto do PDF. O texto pode ter perdido espaços ou quebras de linha: reconstrua as palavras com cuidado. Não invente nada — o que não está no plano fica vazio.

Envie, pela ferramenta enviar_plano:
- a identificação: código da disciplina (ex.: ICE0784), nome, curso, unidade acadêmica, semestre no formato AAAA-N (ex.: 2026-2), docente, turno e cargas horárias;
- a ementa, os objetivos (geral e específicos) e a bibliografia (básica, complementar e virtual), uma referência por linha;
- todas as aulas do cronograma, na ordem, com o rótulo como aparece ("41 e 42"), a data no formato AAAA-MM-DD (o ano vem do plano), a carga horária, o conteúdo e as estratégias; marque avaliacaoId na aula em que uma avaliação acontece;
- as avaliações: id curto como o plano usa (N1, AV2, PP1, AVs, TF…), nome, tipo, data, pontos, duração em minutos se houver, e o peso ou a regra de média como texto;
- os critérios de média e a recuperação, como texto;
- os tópicos de estudo: agrupe as aulas de conteúdo em tópicos (um tópico costuma ser uma ou duas aulas sobre o mesmo assunto) e liste em cada aula os refs dos seus tópicos. Aulas de avaliação, de resolução de exercícios, de revisão ou de recuperação ficam sem tópico. Quando um tópico já existente da disciplina tratar do mesmo assunto, use o id dele como ref e marque existente; só crie um tópico novo (ref curto à sua escolha, existente falso) quando nenhum existente servir.`;

export const MATERIAIS_SYSTEM_PROMPT = `Você liga os materiais de uma turma da UFJ (slides, listas de exercícios, notebooks, códigos) aos tópicos do plano de ensino. Para cada arquivo, use o nome e o trecho do início para decidir a quais tópicos ele pertence — nenhum, um ou vários. Use só os ids da lista de tópicos; não invente tópicos. Se não der para decidir, deixe a lista do arquivo vazia. Envie pela ferramenta sugerir_topicos uma entrada para cada arquivo recebido.`;

// ─── esquema da ferramenta enviar_plano ──────────────────────────────────────

const texto = (description: string) => Type.String({ description });
const textoOpcional = (description: string) => Type.Optional(Type.String({ description }));
const numeroOpcional = (description: string) => Type.Optional(Type.Number({ description }));
const listaDeTextos = (description: string) => Type.Array(Type.String(), { description });

const PlanoSchema = Type.Object({
	materia: Type.Object({
		codigo: texto("Código da disciplina, como aparece no plano (ex.: ICE0784)."),
		nome: texto("Nome da disciplina."),
		curso: texto("Curso."),
		unidade: texto("Unidade acadêmica."),
		ementa: texto("Ementa, como está no plano."),
		objetivos: Type.Object({
			geral: listaDeTextos("Objetivos gerais, um por item."),
			especificos: listaDeTextos("Objetivos específicos, um por item."),
		}),
		bibliografia: Type.Object({
			basica: listaDeTextos("Bibliografia básica, uma referência por item."),
			complementar: listaDeTextos("Bibliografia complementar, uma referência por item."),
			virtual: listaDeTextos("Referências virtuais, uma por item."),
		}),
	}),
	turma: Type.Object({
		semestre: texto("Semestre no formato AAAA-N, ex.: 2026-2."),
		docente: texto("Nome do docente, como aparece no plano."),
		turno: textoOpcional("Turno, ex.: Noturno."),
		chTeorica: numeroOpcional("Carga horária teórica, em horas."),
		chPratica: numeroOpcional("Carga horária prática, em horas."),
		criteriosMedia: texto("Critérios de média e de composição das notas, como texto."),
		recuperacao: textoOpcional("Estratégia de recuperação, como texto."),
		metodologia: textoOpcional("Metodologia, como texto."),
	}),
	topicos: Type.Array(
		Type.Object({
			ref: texto("Id de um tópico existente da disciplina, ou um ref curto novo à sua escolha."),
			titulo: texto("Título curto do tópico de estudo."),
			descricao: textoOpcional("Descrição curta do tópico, se ajudar."),
			existente: Type.Boolean({ description: "Verdadeiro quando ref é o id de um tópico já existente da disciplina." }),
		}),
		{ description: "Tópicos de estudo das aulas de conteúdo." },
	),
	aulas: Type.Array(
		Type.Object({
			rotulo: texto('Número da aula como aparece no plano, ex.: "41 e 42".'),
			data: textoOpcional("Data no formato AAAA-MM-DD."),
			ch: numeroOpcional("Carga horária da aula."),
			conteudo: texto("Conteúdo detalhado e atividades avaliativas."),
			estrategias: textoOpcional("Estratégias, recursos e materiais didáticos."),
			avaliacaoId: textoOpcional("Id da avaliação aplicada nesta aula, se houver."),
			topicos: listaDeTextos("Refs dos tópicos desta aula; vazio em aulas de avaliação, exercícios, revisão ou recuperação."),
		}),
		{ description: "Todas as aulas do cronograma, na ordem." },
	),
	avaliacoes: Type.Array(
		Type.Object({
			id: texto("Id curto como o plano usa: N1, AV2, PP1, AVs, TF…"),
			nome: texto("Nome da avaliação."),
			tipo: Type.Union(TIPOS_AVALIACAO.map((t) => Type.Literal(t)), { description: "Tipo da avaliação." }),
			data: textoOpcional("Data no formato AAAA-MM-DD."),
			pontos: numeroOpcional("Pontuação máxima, ex.: 10."),
			duracaoMin: numeroOpcional("Duração em minutos, se o plano disser."),
			peso: textoOpcional("Peso ou regra de média, como texto."),
		}),
		{ description: "Avaliações do plano." },
	),
});

const SugestoesSchema = Type.Object({
	sugestoes: Type.Array(
		Type.Object({
			arquivo: texto("Nome do arquivo, exatamente como recebido."),
			topicos: listaDeTextos("Ids dos tópicos a que o arquivo pertence; vazio se não der para decidir."),
		}),
		{ description: "Uma entrada para cada arquivo recebido." },
	),
});

/** Extensões aceitas como material de turma (spec Etapa A §7.4). */
export const EXTENSOES_MATERIAIS = [".pdf", ".ipynb", ".md", ".txt", ".c", ".h", ".py", ".java", ".png", ".jpg", ".jpeg"] as const;

const LIMITE_TRECHO = 2000;

/** O trecho do início de um material, para a sugestão de tópicos. */
export async function trechoDoArquivo(nome: string, bytes: Uint8Array, convert: typeof convertPdf = convertPdf): Promise<string> {
	const ext = nome.slice(nome.lastIndexOf(".")).toLowerCase();
	if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") return "";
	if (ext === ".pdf") {
		try {
			const c = await convert(bytes, 1000);
			return c.kind === "converted" ? joinPages(c.pages.slice(0, 2)).slice(0, LIMITE_TRECHO * 2) : "";
		} catch {
			return "";
		}
	}
	const textoBruto = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
	if (ext === ".ipynb") {
		try {
			const nb = JSON.parse(textoBruto) as { cells?: { cell_type?: string; source?: string | string[] }[] };
			const partes = (nb.cells ?? [])
				.filter((c) => c.cell_type === "markdown" || c.cell_type === "code")
				.map((c) => (Array.isArray(c.source) ? c.source.join("") : (c.source ?? "")));
			return partes.join("\n\n").slice(0, LIMITE_TRECHO);
		} catch {
			return textoBruto.slice(0, LIMITE_TRECHO);
		}
	}
	return textoBruto.slice(0, LIMITE_TRECHO);
}

interface PlanoEnviado {
	materia: { codigo: string; nome: string; curso: string; unidade: string; ementa: string; objetivos: { geral: string[]; especificos: string[] }; bibliografia: { basica: string[]; complementar: string[]; virtual: string[] } };
	turma: { semestre: string; docente: string; turno?: string; chTeorica?: number; chPratica?: number; criteriosMedia: string; recuperacao?: string; metodologia?: string };
	topicos: { ref: string; titulo: string; descricao?: string; existente: boolean }[];
	aulas: { rotulo: string; data?: string; ch?: number; conteudo: string; estrategias?: string; avaliacaoId?: string; topicos: string[] }[];
	avaliacoes: { id: string; nome: string; tipo: TipoAvaliacao; data?: string; pontos?: number; duracaoMin?: number; peso?: string }[];
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMESTRE_RE = /^\d{4}-[12]$/;

function problemasDoPlano(p: PlanoEnviado, existentes: ReadonlySet<string>): string | null {
	const erros: string[] = [];
	if (!isValidCodigo(p.materia.codigo)) erros.push(`O código "${p.materia.codigo}" não é um código de disciplina válido (letras maiúsculas e números, ex.: ICE0784).`);
	if (!SEMESTRE_RE.test(p.turma.semestre)) erros.push(`O semestre "${p.turma.semestre}" precisa estar no formato AAAA-N, ex.: 2026-2.`);
	if (!slugify(p.turma.docente)) erros.push("Informe o nome do docente.");
	const refs = new Set(p.topicos.map((t) => t.ref));
	for (const t of p.topicos) if (t.existente && !existentes.has(t.ref)) erros.push(`O tópico "${t.ref}" foi marcado como existente, mas não está na lista de tópicos existentes.`);
	const avIds = new Set(p.avaliacoes.map((a) => a.id));
	p.aulas.forEach((a, i) => {
		for (const ref of a.topicos) if (!refs.has(ref)) erros.push(`A aula ${i + 1} (${a.rotulo}) cita o tópico "${ref}", que não está em topicos.`);
		if (a.data && !DATA_RE.test(a.data)) erros.push(`A data da aula ${i + 1} (${a.rotulo}) precisa estar no formato AAAA-MM-DD.`);
		if (a.avaliacaoId && !avIds.has(a.avaliacaoId)) erros.push(`A aula ${i + 1} (${a.rotulo}) marca a avaliação "${a.avaliacaoId}", que não está em avaliacoes.`);
	});
	for (const a of p.avaliacoes) if (a.data && !DATA_RE.test(a.data)) erros.push(`A data da avaliação ${a.id} precisa estar no formato AAAA-MM-DD.`);
	return erros.length ? `Corrija e envie de novo:\n- ${erros.join("\n- ")}` : null;
}

// ─── engine de produção ──────────────────────────────────────────────────────

/** O modelo do papel "biblioteca" (slot Strong), com as mesmas recusas das sessões. */
export async function resolveBibliotecaEngine(): Promise<PiEngine> {
	const spec = resolveRoleSpec("biblioteca", stores.settingsStore.readSettings());
	if (!spec) throw new ModelsNotConfiguredError(["strong"]);
	if (isSubscriptionProvider(spec.provider)) await refreshConnectionCatalog(spec.provider);
	if (!providerKeyPresent(spec.provider)) throw new ProviderKeyMissingError(spec.provider, ["strong"]);
	return piEngineForSpec(spec, true);
}

// ─── serviço ─────────────────────────────────────────────────────────────────

export interface RascunhoPlano {
	materia: Materia;
	turma: Turma;
	avisos: string[];
	custoUsd: number | null;
	existente: { materia: boolean; turma: boolean };
}

export interface SugestoesMateriais {
	sugestoes: { arquivo: string; topicos: string[] }[];
	custoUsd: number | null;
}

export interface BibliotecaIa {
	rascunhoDoPlano(pdf: Uint8Array, signal?: AbortSignal): Promise<RascunhoPlano>;
	sugerirTopicosDosMateriais(codigo: string, turmaId: string, arquivos: { arquivo: string; trecho: string }[], signal?: AbortSignal): Promise<SugestoesMateriais>;
}

export interface BibliotecaIaDeps {
	engineFor: () => Promise<PiEngine>;
	convert?: typeof convertPdf;
	now?: () => Date;
	estudo: EstudoStore;
	biblioteca: BibliotecaStore;
}

function somaUso(a: CallUsage | null, b: CallUsage): CallUsage {
	if (!a) return b;
	const s = (x: number | undefined, y: number | undefined) => (x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0));
	return {
		inputTokens: s(a.inputTokens, b.inputTokens),
		outputTokens: s(a.outputTokens, b.outputTokens),
		cacheReadTokens: s(a.cacheReadTokens, b.cacheReadTokens),
		cacheWriteTokens: s(a.cacheWriteTokens, b.cacheWriteTokens),
		cacheWrite1hTokens: (a.cacheWrite1hTokens ?? 0) + (b.cacheWrite1hTokens ?? 0),
		reasoningTokens: s(a.reasoningTokens, b.reasoningTokens),
	};
}

/** Acumula o uso de uma chamada e grava no fim, devolvendo o custo estimado. */
function medidor(deps: BibliotecaIaDeps, operacao: UsoBiblioteca["operacao"]) {
	let usage: CallUsage | null = null;
	let model = "";
	return {
		onStep: (u: Usage, m: string) => {
			usage = somaUso(usage, callUsage(u));
			model = m;
		},
		fechar: (): number | null => {
			if (!usage) return null;
			deps.estudo.appendUso({ em: (deps.now?.() ?? new Date()).toISOString(), operacao, model, usage });
			return callCost(usage, model);
		},
	};
}

const CODIGO_NO_TEXTO = /C[óo]digo:\s*([A-Z0-9]{3,12})/;

export function createBibliotecaIa(deps: BibliotecaIaDeps): BibliotecaIa {
	const convert = deps.convert ?? convertPdf;

	async function rascunhoDoPlano(pdf: Uint8Array, signal?: AbortSignal): Promise<RascunhoPlano> {
		const convertido = await convert(pdf, 1000, { signal });
		if (convertido.kind === "too-long") throw new BibliotecaEntradaError("O PDF tem mais de 1000 páginas.");
		if (convertido.kind === "unreadable") throw new BibliotecaEntradaError("Não consegui ler este PDF.");
		const textoPlano = joinPages(convertido.pages);
		if (!textoPlano.trim()) throw new BibliotecaEntradaError("Este PDF não tem texto selecionável (talvez seja escaneado). Por enquanto, a importação aceita só PDFs com texto.");

		const codigoVisto = CODIGO_NO_TEXTO.exec(textoPlano)?.[1];
		const materiaAntes = codigoVisto && isValidCodigo(codigoVisto) ? deps.biblioteca.readMateria(codigoVisto) : null;
		const existentes = (materiaAntes?.topicos ?? []).filter((t) => !t.arquivado);
		const listaExistentes = existentes.length ? existentes.map((t) => `- ${t.id}: ${t.titulo}`).join("\n") : "(nenhum)";
		const idsExistentes = new Set((materiaAntes?.topicos ?? []).map((t) => t.id));

		const engine = await deps.engineFor();
		const uso = medidor(deps, "rascunho-plano");
		let enviado: PlanoEnviado;
		let custoUsd: number | null = null;
		try {
			enviado = await runSubmitAgent<PlanoEnviado>({
				role: "biblioteca",
				toolName: "enviar_plano",
				toolDescription: "Envia a estrutura extraída do plano de ensino.",
				parameters: PlanoSchema,
				fill: (input) => input as PlanoEnviado,
				systemPrompt: PLANO_SYSTEM_PROMPT,
				prompt: `Tópicos já existentes desta disciplina (reaproveite os ids quando o assunto for o mesmo):\n${listaExistentes}\n\nTexto do plano de ensino:\n${textoPlano}`,
				engine,
				signal,
				onStep: uso.onStep,
				neverSubmitted: "O modelo não devolveu a estrutura do plano.",
				validate: (p) => problemasDoPlano(p, idsExistentes),
			});
		} finally {
			custoUsd = uso.fechar();
		}

		// A matéria do rascunho é a do plano; se o código enviado não é o que
		// foi visto no texto, procura de novo para reaproveitar os tópicos.
		const materiaBase = enviado.materia.codigo === codigoVisto ? materiaAntes : deps.biblioteca.readMateria(enviado.materia.codigo);
		const rec = reconcileTopicos(materiaBase?.topicos ?? [], enviado.topicos, enviado.aulas);
		const docenteSlug = slugify(enviado.turma.docente);
		const aulas: Aula[] = enviado.aulas.map((a, i) => {
			const aula: Aula = { ordem: i + 1, rotulo: a.rotulo, conteudo: a.conteudo, topicos: rec.aulas[i] ?? [] };
			if (a.data) aula.data = a.data;
			if (a.ch !== undefined) aula.ch = a.ch;
			if (a.estrategias) aula.estrategias = a.estrategias;
			if (a.avaliacaoId) aula.avaliacaoId = a.avaliacaoId;
			return aula;
		});
		const avaliacoesBase: Avaliacao[] = enviado.avaliacoes.map((a) => {
			const av: Avaliacao = { id: a.id, nome: a.nome, tipo: a.tipo, escopo: { topicos: [] } };
			if (a.data) av.data = a.data;
			if (a.pontos !== undefined) av.pontos = a.pontos;
			if (a.duracaoMin !== undefined) av.duracaoMin = a.duracaoMin;
			if (a.peso) av.peso = a.peso;
			return av;
		});
		const escopos = computeEscopos(computePosicoes(avaliacoesBase, aulas), aulas);
		const agora = (deps.now?.() ?? new Date()).toISOString();
		const materia: Materia = { formato: FORMATO_BIBLIOTECA, ...enviado.materia, topicos: rec.topicos };
		const turma: Turma = {
			formato: FORMATO_BIBLIOTECA,
			id: turmaId(enviado.turma.semestre, docenteSlug),
			semestre: enviado.turma.semestre,
			docente: { nome: enviado.turma.docente, slug: docenteSlug },
			aulas,
			avaliacoes: escopos.avaliacoes,
			criteriosMedia: enviado.turma.criteriosMedia,
			importadoEm: agora,
			revisadoEm: agora,
		};
		if (enviado.turma.turno) turma.turno = enviado.turma.turno;
		if (enviado.turma.chTeorica !== undefined) turma.chTeorica = enviado.turma.chTeorica;
		if (enviado.turma.chPratica !== undefined) turma.chPratica = enviado.turma.chPratica;
		if (enviado.turma.recuperacao) turma.recuperacao = enviado.turma.recuperacao;
		if (enviado.turma.metodologia) turma.metodologia = enviado.turma.metodologia;
		return {
			materia,
			turma,
			avisos: [...rec.erros, ...escopos.avisos],
			custoUsd,
			existente: { materia: materiaBase !== null, turma: materiaBase !== null && deps.biblioteca.readTurma(materia.codigo, turma.id) !== null },
		};
	}

	async function sugerirTopicosDosMateriais(codigo: string, turmaIdAlvo: string, arquivos: { arquivo: string; trecho: string }[], signal?: AbortSignal): Promise<SugestoesMateriais> {
		if (arquivos.length === 0) return { sugestoes: [], custoUsd: null };
		const materia = deps.biblioteca.readMateria(codigo);
		const turma = deps.biblioteca.readTurma(codigo, turmaIdAlvo);
		if (!materia || !turma) throw new BibliotecaEntradaError("Turma não encontrada.");
		const ativos = materia.topicos.filter((t) => !t.arquivado);
		const ids = new Set(ativos.map((t) => t.id));
		const nomes = new Set(arquivos.map((a) => a.arquivo));
		const listaTopicos = ativos
			.map((t) => {
				const conteudos = turma.aulas.filter((a) => a.topicos.includes(t.id)).map((a) => a.conteudo);
				return `- ${t.id}: ${t.titulo}${conteudos.length ? ` — aulas: ${conteudos.join("; ")}` : ""}`;
			})
			.join("\n");
		const blocos = arquivos.map((a) => `### ${a.arquivo}\n${a.trecho || "(sem texto)"}`).join("\n\n");
		const engine = await deps.engineFor();
		const uso = medidor(deps, "sugerir-materiais");
		let enviado: { sugestoes: { arquivo: string; topicos: string[] }[] };
		let custoUsd: number | null = null;
		try {
			enviado = await runSubmitAgent({
				role: "biblioteca",
				toolName: "sugerir_topicos",
				toolDescription: "Envia, para cada arquivo recebido, os ids dos tópicos a que ele pertence.",
				parameters: SugestoesSchema,
				fill: (input) => input as { sugestoes: { arquivo: string; topicos: string[] }[] },
				systemPrompt: MATERIAIS_SYSTEM_PROMPT,
				prompt: `Tópicos do plano de ensino:\n${listaTopicos || "(nenhum)"}\n\nArquivos:\n\n${blocos}`,
				engine,
				signal,
				onStep: uso.onStep,
				neverSubmitted: "O modelo não devolveu as sugestões de tópicos.",
				validate: (v) => {
					const erros: string[] = [];
					for (const s of v.sugestoes) {
						if (!nomes.has(s.arquivo)) erros.push(`O arquivo "${s.arquivo}" não está entre os recebidos.`);
						for (const id of s.topicos) if (!ids.has(id)) erros.push(`O tópico "${id}" (em "${s.arquivo}") não está na lista de tópicos.`);
					}
					return erros.length ? `Corrija e envie de novo:\n- ${erros.join("\n- ")}` : null;
				},
			});
		} finally {
			custoUsd = uso.fechar();
		}
		// Uma entrada por arquivo, na ordem recebida; o que o modelo omitiu fica sem tópico.
		const porArquivo = new Map(enviado.sugestoes.map((s) => [s.arquivo, [...new Set(s.topicos)]]));
		return { sugestoes: arquivos.map((a) => ({ arquivo: a.arquivo, topicos: porArquivo.get(a.arquivo) ?? [] })), custoUsd };
	}

	return { rascunhoDoPlano, sugerirTopicosDosMateriais };
}

/** A instância de produção (engine pelo papel "biblioteca"). */
export const bibliotecaIa: BibliotecaIa = createBibliotecaIa({
	engineFor: resolveBibliotecaEngine,
	estudo: stores.estudoStore,
	biblioteca: stores.bibliotecaStore,
});
