/**
 * TRANSPORTE HTTP DA CONTA UFJ (spec SIGAA §7.2–7.3). As funções de rota
 * vivem aqui para os testes injetarem uma sincronização com SIGAA falso.
 */

import { respostaDeErro } from "../biblioteca-rotas.ts";
import { SigaaEstruturaError, SigaaIndisponivelError, SigaaSenhaRecusadaError, SigaaSessaoExpiradaError } from "./erros.ts";
import { SigaaSegredoIndisponivelError } from "./segredo.ts";
import { SigaaOcupadoError, sincronizacao, type Sincronizacao } from "./sincronizar.ts";

function respostaSigaa(err: unknown): Response {
	if (err instanceof SigaaSenhaRecusadaError) return Response.json({ error: err.message }, { status: 401 });
	if (err instanceof SigaaOcupadoError) return Response.json({ error: err.message }, { status: 409 });
	if (err instanceof SigaaIndisponivelError || err instanceof SigaaSegredoIndisponivelError) return Response.json({ error: err.message }, { status: 503 });
	if (err instanceof SigaaEstruturaError || err instanceof SigaaSessaoExpiradaError) return Response.json({ error: err.message }, { status: 502 });
	return respostaDeErro(err);
}

/** GET /api/sigaa */
export function sigaaEstadoRoute(s: Sincronizacao = sincronizacao): Response {
	return Response.json(s.estado());
}

/** POST /api/sigaa/conta — `{ usuario, senha }` */
export async function sigaaConectarRoute(request: Request, s: Sincronizacao = sincronizacao): Promise<Response> {
	let corpo: { usuario?: unknown; senha?: unknown };
	try {
		corpo = (await request.json()) as typeof corpo;
	} catch {
		return Response.json({ error: "O corpo do pedido não é um JSON válido." }, { status: 400 });
	}
	try {
		return Response.json(await s.conectar(typeof corpo?.usuario === "string" ? corpo.usuario : "", typeof corpo?.senha === "string" ? corpo.senha : ""));
	} catch (err) {
		return respostaSigaa(err);
	}
}

/** DELETE /api/sigaa/conta */
export function sigaaSairRoute(s: Sincronizacao = sincronizacao): Response {
	return Response.json(s.sair());
}

/** POST /api/sigaa/sincronizar */
export function sigaaSincronizarRoute(s: Sincronizacao = sincronizacao): Response {
	return Response.json(s.sincronizarAgora(), { status: 202 });
}
