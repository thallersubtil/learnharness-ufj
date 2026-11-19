/**
 * TRANSPORTE HTTP DA BIBLIOTECA UFJ. As funções de rota vivem aqui (e não nos
 * arquivos app/api/**, que só podem exportar métodos HTTP) para que os testes
 * injetem um serviço com modelo falso. Todas as mensagens são em português.
 */

import { FormBodyLimitError, readBoundedFormData } from "../../lib/bounded-form-data.ts";
import { MAX_IMPORT_BODY_BYTES } from "../../lib/notes-import-limits.ts";
import { BibliotecaConflitoError, BibliotecaEntradaError, BibliotecaFormatoError, BibliotecaNaoEncontradaError } from "../core/biblioteca.ts";
import { ModelsNotConfiguredError, ProviderKeyMissingError } from "../core/settings.ts";
import { bibliotecaIa, type BibliotecaIa } from "./biblioteca-ia.ts";
import { BibliotecaEnvioGrandeError, bibliotecaService, type BibliotecaService } from "./biblioteca.ts";

const PDF_MAGIC = "%PDF-";

/** Converte um erro do serviço na resposta HTTP certa. */
export function respostaDeErro(err: unknown): Response {
	if (err instanceof BibliotecaEntradaError) return Response.json({ error: err.message }, { status: 400 });
	if (err instanceof BibliotecaNaoEncontradaError) return Response.json({ error: err.message }, { status: 404 });
	if (err instanceof BibliotecaEnvioGrandeError) return Response.json({ error: err.message }, { status: 413 });
	if (err instanceof BibliotecaConflitoError) return Response.json({ error: err.message, code: err.code }, { status: 409 });
	if (err instanceof BibliotecaFormatoError) return Response.json({ error: err.message, code: "formato_mais_novo" }, { status: 409 });
	if (err instanceof ModelsNotConfiguredError) return Response.json(err.envelope, { status: 503 });
	if (err instanceof ProviderKeyMissingError) return Response.json(err.envelope, { status: 503 });
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

/** POST /api/biblioteca/plano/rascunho — multipart `plano` → RascunhoPlano (nada é gravado). */
export async function rascunhoRoute(request: Request, ia: BibliotecaIa = bibliotecaIa): Promise<Response> {
	const form = await lerFormulario(request);
	if (form instanceof Response) return form;
	const pdf = await lerPdf(form, "plano");
	if (pdf instanceof Response) return pdf;
	try {
		return Response.json(await ia.rascunhoDoPlano(pdf, request.signal));
	} catch (err) {
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

/** POST .../materiais — multipart `arquivos` (vários): copia e devolve sugestões (sem gravar o mapeamento). */
export async function materiaisPostRoute(request: Request, codigo: string, turmaId: string, svc: BibliotecaService = bibliotecaService): Promise<Response> {
	const form = await lerFormulario(request);
	if (form instanceof Response) return form;
	const files = form.getAll("arquivos").filter((f): f is File => f instanceof File);
	try {
		const arquivos = await Promise.all(files.map(async (f) => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
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
