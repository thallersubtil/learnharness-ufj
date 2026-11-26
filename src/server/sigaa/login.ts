// Adaptado de sigaa-mcp (https://github.com/Pedromaia0/sigaa-mcp). Copyright (c) 2026 Pedro Maia. Licença MIT.
/**
 * LOGIN NO SIGAA DA UFJ (spec SIGAA §4): o formulário direto `loginForm`,
 * sem CAS. Um POST só: com a senha recusada, lança e nunca tenta de novo.
 */

import { SigaaEstruturaError, SigaaSenhaRecusadaError } from "./erros.ts";
import type { Pagina, SigaaSessao } from "./http.ts";
import { documento } from "./jsf.ts";

export const PORTAL = "/sigaa/portais/discente/discente.jsf";

const RECUSADO = /Usu[aá]rio e\/ou senha inv[aá]lidos/i;

/** A página tem a tela de login (senha recusada ou sessão que caiu). */
export function ehTelaDeLogin(p: Pagina): boolean {
	return !!p.html && !!documento(p.html).querySelector('form[name="loginForm"]');
}

/** Entra com usuário e senha e devolve o portal do discente. */
export async function entrar(sessao: SigaaSessao, usuario: string, senha: string): Promise<Pagina> {
	const tela = await sessao.get("/sigaa/verTelaLogin.do");
	const form = documento(tela.html).querySelector('form[name="loginForm"]');
	if (!form) throw new SigaaEstruturaError("tela de login");
	const campos: [string, string][] = [];
	for (const inp of Array.from(form.querySelectorAll("input"))) {
		const nome = inp.getAttribute("name");
		const tipo = (inp.getAttribute("type") ?? "text").toLowerCase();
		if (!nome || tipo === "submit" || tipo === "button") continue;
		const valor = nome === "user.login" ? usuario : nome === "user.senha" ? senha : nome === "width" ? "1440" : nome === "height" ? "900" : (inp.getAttribute("value") ?? "");
		campos.push([nome, valor]);
	}
	const acao = new URL(form.getAttribute("action") ?? "/sigaa/logar.do?dispatch=logOn", tela.url).toString();
	const resposta = await sessao.postar(acao, campos);
	if (ehTelaDeLogin(resposta) || RECUSADO.test(resposta.html)) throw new SigaaSenhaRecusadaError();
	// Depois do login o SIGAA pode parar num aviso; o portal abre direto. Se o portal
	// volta para a tela de login logo depois do POST, o login não pegou: é senha
	// recusada, para nunca ser tentada de novo sozinha.
	const portal = await sessao.get(PORTAL);
	if (ehTelaDeLogin(portal)) throw new SigaaSenhaRecusadaError();
	return portal;
}

/** Sai da conta. Nunca lança: é a última coisa de uma sincronização. */
export async function sair(sessao: SigaaSessao): Promise<void> {
	try {
		await sessao.get("/sigaa/logar.do?dispatch=logOff");
	} catch {
		/* tanto faz */
	}
}
