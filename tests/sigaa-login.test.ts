/** Login no SIGAA da UFJ (spec SIGAA §4, §7.3), contra o SIGAA falso local.
 * Nada acessa a rede; usuário e senha são inventados. */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { SIGAA_BASE, SigaaSessao, baseDoSigaa, corpoLatin1 } from "../src/server/sigaa/http.ts";
import { linkJsf } from "../src/server/sigaa/jsf.ts";
import { entrar } from "../src/server/sigaa/login.ts";
import { SigaaEstruturaError, SigaaSenhaRecusadaError } from "../src/server/sigaa/erros.ts";
import { iniciarSigaaFalso, type SigaaFalso } from "./helpers/sigaa-falso.ts";

const abertos: SigaaFalso[] = [];
after(async () => {
	for (const s of abertos) await s.fechar();
});
async function falso(opcoes: Parameters<typeof iniciarSigaaFalso>[0] = {}) {
	const s = await iniciarSigaaFalso(opcoes);
	abertos.push(s);
	return s;
}
const sessao = (base: string) => new SigaaSessao({ base, esperarMs: 0 });

describe("login no SIGAA", () => {
	it("entra, pula o aviso e chega ao portal", async () => {
		const f = await falso({ avisoDepoisDoLogin: true });
		const portal = await entrar(sessao(f.base), "aluno.teste", "segredo");
		assert.match(portal.url, /\/sigaa\/portais\/discente\/discente\.jsf$/);
		assert.match(portal.html, /CÁLCULO TESTE/);
	});

	it("senha recusada lança e faz um único POST de login", async () => {
		const f = await falso();
		await assert.rejects(entrar(sessao(f.base), "aluno.teste", "errada"), (e: unknown) => e instanceof SigaaSenhaRecusadaError && e.message === "O SIGAA recusou o usuário ou a senha.");
		assert.equal(f.pedidos.filter((p) => p.caminho.startsWith("/sigaa/logar.do")).length, 1);
	});

	it("senha com acento vai em ISO-8859-1", async () => {
		const f = await falso({ senhaCerta: "çã1" });
		await entrar(sessao(f.base), "aluno.teste", "çã1");
		const post = f.pedidos.find((p) => p.metodo === "POST" && p.caminho.startsWith("/sigaa/logar.do"))!;
		assert.match(post.corpo, /user\.senha=%E7%E31/);
		assert.equal(corpoLatin1([["a b", "ç&"]]), "a+b=%E7%26");
	});

	it("recusa sem formulário nem mensagem ainda conta como senha recusada (revisão final, #8)", async () => {
		const f = await falso({ recusaSilenciosa: true });
		await assert.rejects(entrar(sessao(f.base), "aluno.teste", "errada"), SigaaSenhaRecusadaError);
		assert.equal(f.pedidos.filter((p) => p.metodo === "POST" && p.caminho.startsWith("/sigaa/logar.do")).length, 1);
	});

	it("caracteres do windows-1252 vão como o navegador manda (revisão final, #17)", () => {
		assert.equal(corpoLatin1([["s", "€“”–"]]), "s=%80%93%94%96");
	});

	it("recusa redirecionamento para outro host", async () => {
		const fetchFalso = (async () => new Response(null, { status: 302, headers: { Location: "https://outro.exemplo/roubar" } })) as typeof fetch;
		const s = new SigaaSessao({ base: "https://sigaa.exemplo", esperarMs: 0, fetch: fetchFalso });
		await assert.rejects(s.get("/sigaa/verTelaLogin.do"), (e: unknown) => e instanceof SigaaEstruturaError && /\(https:\/\/outro\.exemplo\)/.test(e.message) && !/roubar/.test(e.message));
	});

	it("o download segue para o servidor de arquivos da UFJ, sem levar os cookies do SIGAA (sincronização real, 24/11)", async () => {
		const pedidos: { url: string; cookie: string | null }[] = [];
		const fetchFalso = (async (url: URL | string, init?: RequestInit) => {
			const u = new URL(String(url));
			pedidos.push({ url: u.toString(), cookie: new Headers(init?.headers).get("cookie") });
			if (u.hostname === "sigaa.sistemas.ufj.edu.br" && u.pathname === "/sigaa/inicio") return new Response("<html></html>", { status: 200, headers: { "Set-Cookie": "JSESSIONID=abc; Path=/sigaa", "Content-Type": "text/html" } });
			if (u.hostname === "sigaa.sistemas.ufj.edu.br") return new Response(null, { status: 301, headers: { Location: "https://arquivos.sistemas.ufj.edu.br/arquivos/2026abc/Aula.pdf" } });
			return new Response("%PDF-1.4", { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Aula.pdf"', "Set-Cookie": "rastreio=1" } });
		}) as typeof fetch;
		const s = new SigaaSessao({ base: SIGAA_BASE, esperarMs: 0, fetch: fetchFalso });
		await s.get("/sigaa/inicio");
		const r = await s.postar(`${SIGAA_BASE}/sigaa/ava/ArquivoTurma/listar_discente.jsf`, [["id", "1"]]);
		assert.equal(new TextDecoder().decode(r.bytes), "%PDF-1.4");
		assert.equal(pedidos[1]!.cookie, "JSESSIONID=abc", "o SIGAA recebe a sessão");
		assert.equal(pedidos[2]!.url, "https://arquivos.sistemas.ufj.edu.br/arquivos/2026abc/Aula.pdf");
		assert.equal(pedidos[2]!.cookie, null, "o servidor de arquivos não recebe cookie nenhum");
		await s.get("/sigaa/inicio");
		assert.equal(pedidos[3]!.cookie, "JSESSIONID=abc", "cookie do servidor de arquivos não entra na sessão");
	});

	it("o servidor de arquivos só vale como destino de redirecionamento, e só com a base real", async () => {
		const fetchFalso = (async () => new Response("x", { status: 200 })) as typeof fetch;
		await assert.rejects(new SigaaSessao({ base: SIGAA_BASE, esperarMs: 0, fetch: fetchFalso }).get("https://arquivos.sistemas.ufj.edu.br/arquivos/x.pdf"), SigaaEstruturaError);
		const comRedirect = (async (url: URL | string) => (new URL(String(url)).hostname === "sigaa.exemplo" ? new Response(null, { status: 301, headers: { Location: "https://arquivos.sistemas.ufj.edu.br/a.pdf" } }) : new Response("x"))) as typeof fetch;
		await assert.rejects(new SigaaSessao({ base: "https://sigaa.exemplo", esperarMs: 0, fetch: comRedirect }).get("/x"), SigaaEstruturaError);
	});

	it("baseDoSigaa: produção ignora LH_SIGAA_BASE_URL no app de desktop", () => {
		assert.equal(baseDoSigaa({ LH_SIGAA_BASE_URL: "http://x", LH_DESKTOP_SERVER: "1" }), SIGAA_BASE);
		assert.equal(baseDoSigaa({ LH_SIGAA_BASE_URL: "http://x" }), "http://x");
		assert.equal(baseDoSigaa({}), "https://sigaa.sistemas.ufj.edu.br");
	});

	it("linkJsf lê formulário e parâmetros", () => {
		const onclick = "if(typeof jsfcljs == 'function'){jsfcljs(document.getElementById('formAtualizacoesTurmas'),{'formAtualizacoesTurmas:j_id_jsp_1_250':'formAtualizacoesTurmas:j_id_jsp_1_250','idTurma':'1001'},'');}return false";
		assert.deepEqual(linkJsf(onclick), { form: "formAtualizacoesTurmas", params: { "formAtualizacoesTurmas:j_id_jsp_1_250": "formAtualizacoesTurmas:j_id_jsp_1_250", idTurma: "1001" } });
		assert.equal(linkJsf("window.open('x')"), null);
		assert.equal(linkJsf(null), null);
	});
});
