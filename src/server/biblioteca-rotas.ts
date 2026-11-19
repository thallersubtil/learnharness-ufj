/**
 * TRANSPORTE HTTP DA BIBLIOTECA UFJ. As funções de rota vivem aqui (e não nos
 * arquivos app/api/**, que só podem exportar métodos HTTP) para que os testes
 * injetem um serviço com modelo falso. Todas as mensagens são em português.
 */

import { FormBodyLimitError, readBoundedFormData } from "../../lib/bounded-form-data.ts";
import { MAX_IMPORT_BODY_BYTES } from "../../lib/notes-import-limits.ts";
import { BibliotecaConflitoError, BibliotecaEntradaError, BibliotecaFormatoError } from "../core/biblioteca.ts";
import { ModelsNotConfiguredError, ProviderKeyMissingError } from "../core/settings.ts";
import { bibliotecaIa, type BibliotecaIa } from "./biblioteca-ia.ts";

const PDF_MAGIC = "%PDF-";

/** Converte um erro do serviço na resposta HTTP certa. */
export function respostaDeErro(err: unknown): Response {
	if (err instanceof BibliotecaEntradaError) return Response.json({ error: err.message }, { status: 400 });
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
