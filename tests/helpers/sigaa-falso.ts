/**
 * Um SIGAA falso para os testes (spec SIGAA §7.10): um servidor HTTP local que
 * serve as páginas de exemplo de `tests/fixtures/sigaa/` em ISO-8859-1, como o
 * SIGAA da UFJ, e confere o que um cliente real precisa acertar: o cookie
 * JSESSIONID, o formulário de login, o javax.faces.ViewState e os parâmetros
 * dos comandos JSF. Nada aqui acessa a rede de verdade.
 */

import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";

const PASTA = path.join(import.meta.dirname, "..", "fixtures", "sigaa");

export interface OpcoesSigaaFalso {
	usuario?: string;
	senhaCerta?: string;
	/** Depois do login, o SIGAA para na página de aviso (Avaliação Institucional). */
	avisoDepoisDoLogin?: boolean;
	/** Depois de N páginas internas, a sessão cai (o SIGAA volta para a tela de login). */
	derrubarSessaoDepois?: number;
	/** Rótulo de menu cuja página responde 500. */
	secaoQuebrada?: string;
	/** Chamado antes de servir cada página interna (caminho e, para seções, o rótulo). */
	aoServir?: (caminho: string, rotulo?: string) => void;
}

export interface PedidoRecebido {
	metodo: string;
	caminho: string;
	corpo: string;
}

export interface SigaaFalso {
	base: string;
	pedidos: PedidoRecebido[];
	fechar(): Promise<void>;
}

interface Sessao {
	id: string;
	logado: boolean;
	caiu: boolean;
	internos: number;
	contador: number;
	viewStates: string[];
	turma?: string;
}

/** Lê o corpo x-www-form-urlencoded como o servidor Java lê: bytes em ISO-8859-1. */
export function lerFormLatin1(corpo: string): Map<string, string> {
	const out = new Map<string, string>();
	const dec = (s: string) => {
		const bytes: number[] = [];
		for (let i = 0; i < s.length; i++) {
			const c = s[i]!;
			if (c === "+") bytes.push(0x20);
			else if (c === "%" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
				bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
				i += 2;
			} else bytes.push(c.charCodeAt(0));
		}
		return Buffer.from(bytes).toString("latin1");
	};
	for (const par of corpo.split("&")) {
		if (!par) continue;
		const i = par.indexOf("=");
		out.set(dec(i < 0 ? par : par.slice(0, i)), dec(i < 0 ? "" : par.slice(i + 1)));
	}
	return out;
}

function pagina(arquivo: string, troca: Record<string, string>): Buffer {
	let texto = fs.readFileSync(path.join(PASTA, arquivo), "utf8");
	for (const [k, v] of Object.entries(troca)) texto = texto.split(`{{${k}}}`).join(v);
	return Buffer.from(texto, "latin1");
}

export async function iniciarSigaaFalso(opcoes: OpcoesSigaaFalso = {}): Promise<SigaaFalso> {
	const usuario = opcoes.usuario ?? "aluno.teste";
	const senhaCerta = opcoes.senhaCerta ?? "segredo";
	const sessoes = new Map<string, Sessao>();
	const pedidos: PedidoRecebido[] = [];

	const servidor = http.createServer((req, res) => {
		const partes: Buffer[] = [];
		req.on("data", (c: Buffer) => partes.push(c));
		req.on("end", () => {
			const corpo = Buffer.concat(partes).toString("latin1");
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			const caminho = url.pathname.replace(/;jsessionid=[^/?]*/i, "");
			pedidos.push({ metodo: req.method ?? "GET", caminho: caminho + url.search, corpo });

			const cookie = /JSESSIONID=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
			let s = cookie ? sessoes.get(cookie) : undefined;
			const html = (arquivo: string, troca: Record<string, string> = {}, status = 200) => {
				const vs = s ? `j_id${++s.contador}` : "j_id0";
				if (s) s.viewStates = [...s.viewStates.slice(-14), vs];
				res.writeHead(status, { "Content-Type": "text/html;charset=ISO-8859-1" });
				res.end(pagina(arquivo, { VIEWSTATE: vs, ...troca }));
			};
			const redirecionar = (para: string) => {
				res.writeHead(302, { Location: para });
				res.end();
			};

			if (caminho === "/sigaa/verTelaLogin.do") {
				if (!s) {
					s = { id: `${randomBytes(8).toString("hex").toUpperCase()}.srv1inst1`, logado: false, caiu: false, internos: 0, contador: 0, viewStates: [] };
					sessoes.set(s.id, s);
					res.setHeader("Set-Cookie", `JSESSIONID=${s.id}; Path=/sigaa; HttpOnly`);
				}
				return html("login.html", { ACAO: `/sigaa/logar.do;jsessionid=${s.id}?dispatch=logOn`, MENSAGEM: "" });
			}
			if (caminho === "/sigaa/logar.do" && url.searchParams.get("dispatch") === "logOn" && req.method === "POST") {
				if (!s) return redirecionar("/sigaa/verTelaLogin.do");
				const form = lerFormLatin1(corpo);
				const completo = ["width", "height", "urlRedirect", "subsistemaRedirect", "acao", "acessibilidade"].every((k) => form.has(k));
				if (completo && form.get("user.login") === usuario && form.get("user.senha") === senhaCerta) {
					s.logado = true;
					return redirecionar(opcoes.avisoDepoisDoLogin ? "/sigaa/avaliacao/formulario_avaliacao/notificacao_view.jsf" : "/sigaa/portais/discente/discente.jsf");
				}
				return html("login.html", { ACAO: `/sigaa/logar.do;jsessionid=${s.id}?dispatch=logOn`, MENSAGEM: '<center style="color: #922;">Usuário e/ou senha inválidos</center>' });
			}
			if (caminho === "/sigaa/logar.do" && url.searchParams.get("dispatch") === "logOff") {
				if (s) s.logado = false;
				return redirecionar("/sigaa/verTelaLogin.do");
			}

			// Páginas internas: só com a sessão logada.
			if (!s || !s.logado || s.caiu) return redirecionar("/sigaa/verTelaLogin.do");
			s.internos++;
			if (opcoes.derrubarSessaoDepois !== undefined && s.internos > opcoes.derrubarSessaoDepois) {
				s.caiu = true;
				return redirecionar("/sigaa/verTelaLogin.do");
			}
			const form = lerFormLatin1(corpo);
			const viewStateValido = () => s!.viewStates.includes(form.get("javax.faces.ViewState") ?? "");

			if (caminho === "/sigaa/avaliacao/formulario_avaliacao/notificacao_view.jsf") {
				opcoes.aoServir?.(caminho);
				return html("aviso.html");
			}
			if (caminho === "/sigaa/portais/discente/discente.jsf" && req.method === "GET") {
				opcoes.aoServir?.(caminho);
				return html("portal.html");
			}
			const extra = tratarTurma({ req, caminho, form, s, viewStateValido, html, opcoes });
			if (extra) return;
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("não encontrado");
		});
	});

	await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
	const { port } = servidor.address() as AddressInfo;
	return {
		base: `http://127.0.0.1:${port}`,
		pedidos,
		fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
	};
}

interface ContextoTurma {
	req: http.IncomingMessage;
	caminho: string;
	form: Map<string, string>;
	s: Sessao;
	viewStateValido: () => boolean;
	html: (arquivo: string, troca?: Record<string, string>, status?: number) => void;
	opcoes: OpcoesSigaaFalso;
}

/** As páginas de dentro das turmas (Tarefa 6). Devolve true se respondeu. */
function tratarTurma(_c: ContextoTurma): boolean {
	return false;
}
