/**
 * TRANSPORTE HTTP DA BIBLIOTECA UFJ. As funções de rota vivem aqui (e não nos
 * arquivos app/api/**, que só podem exportar métodos HTTP) para que os testes
 * injetem um serviço com modelo falso. Todas as mensagens são em português.
 */

import fs from "node:fs/promises";
import { FormBodyLimitError, readBoundedFormData } from "../../lib/bounded-form-data.ts";
import { MAX_IMPORT_BODY_BYTES } from "../../lib/notes-import-limits.ts";
import { BibliotecaConflitoError, BibliotecaEntradaError, BibliotecaFormatoError, BibliotecaNaoEncontradaError } from "../core/biblioteca.ts";
import { ModelsNotConfiguredError, ProviderKeyMissingError } from "../core/settings.ts";
import { bibliotecaIa, type BibliotecaIa } from "./biblioteca-ia.ts";
import { BibliotecaEnvioGrandeError, bibliotecaService, type BibliotecaService } from "./biblioteca.ts";
import { preparacaoView, salvarHoras } from "./preparacao.ts";

const PDF_MAGIC = "%PDF-";

/** Converte um erro do serviço na resposta HTTP certa. */
export function respostaDeErro(err: unknown): Response {
	if (err instanceof BibliotecaEntradaError) return Response.json({ error: err.message }, { status: 400 });
	if (err instanceof BibliotecaNaoEncontradaError) return Response.json({ error: err.message }, { status: 404 });
	if (err instanceof BibliotecaEnvioGrandeError) return Response.json({ error: err.message }, { status: 413 });
	if (err instanceof BibliotecaConflitoError) return Response.json({ error: err.message, code: err.code }, { status: 409 });
	if (err instanceof BibliotecaFormatoError) return Response.json({ error: err.message, code: "formato_mais_novo" }, { status: 409 });
	if (err instanceof ModelsNotConfiguredError) return Response.json({ ...err.envelope, error: "Nenhum modelo configurado. Escolha seus modelos em Settings → Providers." }, { status: 503 });
	if (err instanceof ProviderKeyMissingError) return Response.json({ ...err.envelope, error: `Falta a chave de API do provedor ${err.envelope.provider}. Adicione em Settings → Providers.` }, { status: 503 });
	console.error("[biblioteca] erro inesperado:", err);
	return Response.json({ error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
}

/** Lê o corpo multipart com o limite das importações (26 MiB). */
export async function lerFormulario(request: Request): Promise<FormData | Response> {
	try {
		return await readBoundedFormData(request, MAX_IMPORT_BODY_BYTES);
	} catch (err) {
		if (err instanceof FormBodyLimitError) return Response.json({ error: "O envio é grande demais. O limite é 25 MB." }, { status: 413 });
		return Response.json({ error: "Não consegui ler o envio. Ele pode estar incompleto; escolha o arquivo de novo." }, { status: 400 });
	}
}

/** Os bytes de um campo de arquivo que precisa ser PDF, ou a resposta de erro. */
export async function lerPdf(form: FormData, campo: string): Promise<Uint8Array | Response> {
	const file = form.get(campo);
	if (!(file instanceof File)) return Response.json({ error: "Escolha o PDF do plano de ensino." }, { status: 400 });
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length)) !== PDF_MAGIC) return Response.json({ error: "O arquivo não é um PDF." }, { status: 400 });
	return bytes;
}

/** O pedido foi cancelado pelo aluno (botão Cancelar ou saiu da tela). */
const cancelada = () => Response.json({ error: "Importação cancelada." }, { status: 499 });

/** POST /api/biblioteca/plano/rascunho — multipart `plano` → RascunhoPlano (nada é gravado).
 *  Cancelável: o sinal do pedido chega à conversão do PDF e à chamada do modelo. */
export async function rascunhoRoute(request: Request, ia: BibliotecaIa = bibliotecaIa): Promise<Response> {
	if (request.signal.aborted) return cancelada();
	const form = await lerFormulario(request);
	if (form instanceof Response) return request.signal.aborted ? cancelada() : form;
	const pdf = await lerPdf(form, "plano");
	if (pdf instanceof Response) return pdf;
	if (request.signal.aborted) return cancelada();
	try {
		return Response.json(await ia.rascunhoDoPlano(pdf, request.signal));
	} catch (err) {
		if (request.signal.aborted) return cancelada();
		return respostaDeErro(err);
	}
}

// ─── salvar, listar e editar (tarefa 6) ──────────────────────────────────────

async function lerJson(request: Request): Promise<unknown | Response> {
	try {
		return await request.json();
	} catch {
		return Response.json({ error: "O corpo do pedido não é um JSON válido." }, { status: 400 });
	}
}

/** GET /api/biblioteca */
export async function listarRoute(svc: BibliotecaService = bibliotecaService): Promise<Response> {
	try {
		return Response.json(svc.listar());
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** POST /api/biblioteca/plano — multipart `dados` (JSON {materia, turma, substituir}) e `plano` (PDF). */
export async function salvarPlanoRoute(request: Request, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const form = await lerFormulario(request);
	if (form instanceof Response) return form;
	const raw = form.get("dados");
	let dados: { materia?: unknown; turma?: unknown; substituir?: unknown };
	try {
		dados = JSON.parse(typeof raw === "string" ? raw : "");
	} catch {
		return Response.json({ error: "Os dados do plano não são um JSON válido." }, { status: 400 });
	}
	const pdf = await lerPdf(form, "plano");
	if (pdf instanceof Response) return pdf;
	try {
		return Response.json(svc.salvarPlano({ materia: dados?.materia, turma: dados?.turma, substituir: dados?.substituir === true }, pdf));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** GET /api/biblioteca/materias/[codigo] */
export async function materiaGetRoute(codigo: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	try {
		return Response.json(svc.lerMateria(codigo));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** PUT /api/biblioteca/materias/[codigo] — a matéria inteira. */
export async function materiaPutRoute(request: Request, codigo: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const body = await lerJson(request);
	if (body instanceof Response) return body;
	try {
		return Response.json(svc.salvarMateria(codigo, body));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** GET /api/biblioteca/materias/[codigo]/turmas/[turma] */
export async function turmaGetRoute(codigo: string, turmaId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	try {
		return Response.json(svc.lerTurma(codigo, turmaId));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** PUT /api/biblioteca/materias/[codigo]/turmas/[turma] — a turma inteira. */
export async function turmaPutRoute(request: Request, codigo: string, turmaId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const body = await lerJson(request);
	if (body instanceof Response) return body;
	try {
		return Response.json(svc.salvarTurma(codigo, turmaId, body));
	} catch (err) {
		return respostaDeErro(err);
	}
}

// ─── materiais da turma (tarefa 7) ───────────────────────────────────────────

/** GET .../arquivos/[nome] — o arquivo da turma, inline quando o navegador o abre (spec chat+SIGAA §5.5). */
export async function arquivoGetRoute(codigo: string, turmaId: string, nome: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	try {
		const { caminho, tipo, inline } = svc.abrirArquivo(codigo, turmaId, nome);
		const bytes = await fs.readFile(caminho);
		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				"Content-Type": tipo,
				"Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
				"X-Content-Type-Options": "nosniff",
				"Cache-Control": "private, no-store",
			},
		});
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** POST .../materiais — multipart `arquivos` (vários): copia e devolve sugestões (sem gravar o mapeamento).
 *  Com o campo `topico`, grava cada arquivo já ligado a esse tópico, sem chamar o modelo. */
export async function materiaisPostRoute(request: Request, codigo: string, turmaId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const form = await lerFormulario(request);
	if (form instanceof Response) return form;
	const files = form.getAll("arquivos").filter((f): f is File => f instanceof File);
	const topico = form.get("topico");
	try {
		const arquivos = await Promise.all(files.map(async (f) => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
		if (typeof topico === "string" && topico.trim()) {
			if (arquivos.length === 0) throw new BibliotecaEntradaError("Escolha pelo menos um arquivo.");
			// Confere todos antes de gravar o primeiro: um arquivo recusado não deixa os outros pela metade.
			for (const a of arquivos) svc.conferirArquivo(codigo, turmaId, a.nome, a.bytes, topico.trim());
			const adicionados = arquivos.map((a) => svc.adicionarArquivo(codigo, turmaId, a.nome, a.bytes, topico.trim()));
			return Response.json({ adicionados, sugestoes: [], custoUsd: null });
		}
		return Response.json(await svc.adicionarMateriais(codigo, turmaId, arquivos, request.signal));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** PUT .../materiais — JSON `{ arquivos: [{arquivo, titulo?, topicos}] }`: grava o mapeamento revisado. */
export async function materiaisPutRoute(request: Request, codigo: string, turmaId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const body = await lerJson(request);
	if (body instanceof Response) return body;
	try {
		return Response.json(svc.salvarReferencias(codigo, turmaId, body));
	} catch (err) {
		return respostaDeErro(err);
	}
}

// ─── preparação (tarefa 9) ───────────────────────────────────────────────────

/** GET /api/biblioteca/preparacao?materia=&turma=&avaliacao= */
export async function preparacaoGetRoute(request: Request): Promise<Response> {
	const q = new URL(request.url).searchParams;
	const materia = q.get("materia");
	const turma = q.get("turma");
	const avaliacao = q.get("avaliacao");
	if (!materia || !turma || !avaliacao) return Response.json({ error: "Informe matéria, turma e avaliação." }, { status: 400 });
	try {
		return Response.json(preparacaoView({ materia, turma, avaliacao }, new Date()));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** PUT /api/biblioteca/preparacao — `{materia, turma, avaliacao, horas: number | null}` */
export async function preparacaoPutRoute(request: Request): Promise<Response> {
	const body = await lerJson(request);
	if (body instanceof Response) return body;
	try {
		return Response.json(salvarHoras(body));
	} catch (err) {
		return respostaDeErro(err);
	}
}

// ─── provas: data, nova prova e conteúdo (spec SIGAA §7.5–7.6) ───────────────

/** PUT .../avaliacoes/[avaliacao] — `{ nome?: string; data?: string | null; topicos?: string[] }` (ao menos um). */
export async function provaPutRoute(request: Request, codigo: string, turmaId: string, avaliacaoId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const body = await lerJson(request);
	if (body instanceof Response) return body;
	const b = (body && typeof body === "object" ? body : {}) as { nome?: unknown; data?: unknown; topicos?: unknown };
	const temNome = "nome" in b;
	const temData = "data" in b;
	const temTopicos = "topicos" in b;
	if (!temNome && !temData && !temTopicos) return Response.json({ error: "Informe o nome, a data ou os tópicos da prova." }, { status: 400 });
	if (temNome && typeof b.nome !== "string") return Response.json({ error: "Dê um nome à prova." }, { status: 400 });
	if (temData && b.data !== null && typeof b.data !== "string") return Response.json({ error: "Informe a data no formato AAAA-MM-DD." }, { status: 400 });
	if (temTopicos && (!Array.isArray(b.topicos) || b.topicos.some((t) => typeof t !== "string"))) return Response.json({ error: "Os tópicos precisam ser uma lista de ids." }, { status: 400 });
	try {
		let turma = temNome ? svc.renomearProva(codigo, turmaId, avaliacaoId, b.nome as string) : undefined;
		if (temData) turma = svc.definirData(codigo, turmaId, avaliacaoId, b.data as string | null);
		if (temTopicos) turma = svc.definirEscopo(codigo, turmaId, avaliacaoId, b.topicos as string[]);
		return Response.json(turma);
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** DELETE .../avaliacoes/[avaliacao] — apaga uma prova criada à mão. */
export function provaDeleteRoute(codigo: string, turmaId: string, avaliacaoId: string, svc: BibliotecaService = bibliotecaService): Response {
	try {
		return Response.json(svc.removerProva(codigo, turmaId, avaliacaoId));
	} catch (err) {
		return respostaDeErro(err);
	}
}

/** POST .../avaliacoes — `{ nome: string; data?: string }`. */
export async function provaPostRoute(request: Request, codigo: string, turmaId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const body = await lerJson(request);
	if (body instanceof Response) return body;
	const b = (body && typeof body === "object" ? body : {}) as { nome?: unknown; data?: unknown };
	if (b.data !== undefined && typeof b.data !== "string") return Response.json({ error: "Informe a data no formato AAAA-MM-DD." }, { status: 400 });
	try {
		return Response.json(svc.adicionarProva(codigo, turmaId, { nome: typeof b.nome === "string" ? b.nome : "", ...(typeof b.data === "string" && b.data ? { data: b.data } : {}) }));
	} catch (err) {
		return respostaDeErro(err);
	}
}
