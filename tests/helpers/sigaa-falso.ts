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
	/** Seção de uma turma cuja página responde 500. */
	secaoQuebrada?: { idTurma: string; rotulo: string };
	/** Cada página de Arquivos só aceita um download (como uma visão JSF que expira). */
	umDownloadPorPagina?: boolean;
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
	/** Downloads feitos a partir de cada ViewState. */
	downloads: Map<string, number>;
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
					s = { id: `${randomBytes(8).toString("hex").toUpperCase()}.srv1inst1`, logado: false, caiu: false, internos: 0, contador: 0, viewStates: [], downloads: new Map() };
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
			const extra = tratarTurma({ req, caminho, form, s, viewStateValido, html, opcoes, res });
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
	res: http.ServerResponse;
}

/** Os itens do menu das páginas de exemplo: sufixo da chave → rótulo. */
export const MENU_FALSO: Record<string, string> = {
	"81": "Principal", "82": "Plano de Ensino", "83": "Participantes", "84": "Notícias", "85": "Frequência", "86": "Ver Notas",
	"87": "Fóruns", "88": "Referências", "89": "Arquivos", "90": "Avaliações", "91": "Tarefas", "92": "Questionários",
};

const NOTEBOOK = JSON.stringify({
	cells: [
		{ cell_type: "markdown", source: ["# Exemplos\n", "Derivadas com a regra da cadeia."] },
		{ cell_type: "code", source: ["def derivada(x):\n", "    return 2 * x"], outputs: [{ output_type: "stream", text: ["SAIDA_GRANDE ".repeat(50)] }] },
	],
	metadata: { kernelspec: { language: "python" } },
});

/** Os arquivos das páginas de exemplo, pelo id do download. */
const ARQUIVOS_FALSOS: Record<string, { nome: string; tipo: string; corpo: Buffer }> = {
	"5001": { nome: "Aula_1_Limites.pdf", tipo: "application/pdf", corpo: Buffer.from("%PDF-1.4 limites") },
	"5002": { nome: "Lista_regra_da_cadeia.pdf", tipo: "application/pdf", corpo: Buffer.from("%PDF-1.4 lista") },
	"5003": { nome: "Exemplos.ipynb", tipo: "application/octet-stream", corpo: Buffer.from(NOTEBOOK) },
	"5004": { nome: "Ficha de avaliação.docx", tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", corpo: Buffer.from("PK ficha") },
	"6001": { nome: "Aula_1_Introducao.pdf", tipo: "application/pdf", corpo: Buffer.from("%PDF-1.4 introducao") },
};

const PAGINAS: Record<string, { principal: string; avaliacoes: string; arquivos: string }> = {
	"1001": { principal: "turma-principal.html", avaliacoes: "turma-avaliacoes.html", arquivos: "turma-arquivos.html" },
	"1002": { principal: "turma2-principal.html", avaliacoes: "turma-avaliacoes-vazia.html", arquivos: "turma2-arquivos.html" },
};

/** As páginas de dentro das turmas. Devolve true se respondeu. */
function tratarTurma(c: ContextoTurma): boolean {
	const { req, caminho, form, s, opcoes, res } = c;
	if (req.method !== "POST") return false;
	// Abrir a turma: o formulário da lista de turmas do portal.
	if (caminho === "/sigaa/portais/discente/discente.jsf" && form.has("form_acessarTurmaVirtual:turmaVirtual")) {
		const id = form.get("idTurma") ?? "";
		if (!c.viewStateValido() || !PAGINAS[id]) {
			c.html("portal.html");
			return true;
		}
		s.turma = id;
		opcoes.aoServir?.(caminho, "Principal");
		c.html(PAGINAS[id]!.principal);
		return true;
	}
	const paginas = s.turma ? PAGINAS[s.turma] : undefined;
	// Itens do menu da turma.
	if (caminho === "/sigaa/ava/index.jsf" && form.has("formMenu") && paginas) {
		const chave = [...form.keys()].find((k) => /^formMenu:j_id_jsp_1_\d+$/.test(k) && form.get(k) === k && k !== "formMenu:j_id_jsp_1_44");
		const rotulo = chave ? MENU_FALSO[chave.slice("formMenu:j_id_jsp_1_".length)] : undefined;
		if (!c.viewStateValido() || !rotulo) {
			c.html(paginas.principal);
			return true;
		}
		opcoes.aoServir?.(caminho, rotulo);
		if (opcoes.secaoQuebrada && opcoes.secaoQuebrada.idTurma === s.turma && opcoes.secaoQuebrada.rotulo === rotulo) {
			res.writeHead(500, { "Content-Type": "text/html;charset=ISO-8859-1" });
			res.end("erro interno");
			return true;
		}
		c.html(rotulo === "Avaliações" ? paginas.avaliacoes : rotulo === "Arquivos" ? paginas.arquivos : paginas.principal);
		return true;
	}
	// Download pela listagem de Arquivos.
	if (caminho === "/sigaa/ava/ArquivoTurma/listar_discente.jsf" && form.has("formAva") && paginas) {
		const vs = form.get("javax.faces.ViewState") ?? "";
		const feitos = s.downloads.get(vs) ?? 0;
		const arq = ARQUIVOS_FALSOS[form.get("id") ?? ""];
		if (!c.viewStateValido() || !arq || (opcoes.umDownloadPorPagina && feitos >= 1)) {
			c.html(paginas.principal);
			return true;
		}
		s.downloads.set(vs, feitos + 1);
		opcoes.aoServir?.(caminho, "download");
		res.writeHead(200, { "Content-Type": arq.tipo, "Content-Disposition": `attachment; filename="${Buffer.from(arq.nome, "latin1").toString("latin1")}"` });
		res.end(arq.corpo);
		return true;
	}
	return false;
}
