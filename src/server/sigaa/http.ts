// Adaptado de sigaa-mcp (https://github.com/Pedromaia0/sigaa-mcp). Copyright (c) 2026 Pedro Maia. Licença MIT.
/**
 * SESSÃO HTTP COM O SIGAA DA UFJ (spec SIGAA §4, §7.3).
 *
 * Cookies só na memória, redirecionamentos seguidos à mão (para guardar o
 * cookie de cada passo), pausa entre pedidos para não sobrecarregar o SIGAA,
 * e as páginas decodificadas pelos bytes no charset da resposta: o SIGAA
 * responde em ISO-8859-1 e o `Response.text()` do Node estragaria os acentos.
 * Nenhum erro ou log leva corpo de pedido, cookie ou campo de formulário.
 */

import { SigaaEstruturaError, SigaaIndisponivelError } from "./erros.ts";

export const SIGAA_BASE = "https://sigaa.sistemas.ufj.edu.br";

/** O servidor de arquivos da UFJ: o download de um arquivo da turma responde 301
 *  para cá (visto na sincronização real de 24/11/2026). Só vale como destino de
 *  redirecionamento e nunca recebe cookie do SIGAA. */
export const ARQUIVOS_UFJ = "https://arquivos.sistemas.ufj.edu.br";

/** A base do SIGAA. Outra base só fora do app de desktop (desenvolvimento e testes). */
export function baseDoSigaa(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
	const outra = env.LH_SIGAA_BASE_URL?.trim();
	if (outra && env.LH_DESKTOP_SERVER !== "1") return outra.replace(/\/+$/, "");
	return SIGAA_BASE;
}

export interface Pagina {
	url: string;
	status: number;
	tipo: string;
	bytes: Uint8Array;
	/** O HTML decodificado; vazio quando a resposta não é uma página. */
	html: string;
	headers: Headers;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Os caracteres que o windows-1252 põe em 0x80–0x9F (os navegadores tratam ISO-8859-1 como windows-1252). */
const CP1252: Record<number, number> = {
	0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
	0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
	0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
	0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Corpo x-www-form-urlencoded como um navegador numa página ISO-8859-1 (na prática, windows-1252). */
export function corpoLatin1(campos: [string, string][]): string {
	const byte = (b: number) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
	const enc = (s: string) => {
		let out = "";
		for (const ch of s) {
			const c = ch.codePointAt(0)!;
			if (c === 0x20) out += "+";
			else if (/[A-Za-z0-9*\-._]/.test(ch)) out += ch;
			else if (c < 256) out += byte(c);
			else if (CP1252[c] !== undefined) out += byte(CP1252[c]!);
			else out += encodeURIComponent(`&#${c};`);
		}
		return out;
	};
	return campos.map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
}

function charsetDe(tipo: string): string {
	const m = /charset=([^;\s]+)/i.exec(tipo);
	const c = m?.[1]?.toLowerCase();
	return c === "utf-8" || c === "utf8" ? "utf-8" : "windows-1252";
}

interface Vigia {
	reiniciar(): void;
	parar(): void;
}

export class SigaaSessao {
	private readonly base: URL;
	private readonly esperarMs: number;
	private readonly fetchFn: typeof fetch;
	private readonly timeoutMs: number;
	private readonly cookies = new Map<string, string>();
	/** Origens aceitas só como destino de redirecionamento (o servidor de arquivos). */
	private readonly origensDeArquivos: ReadonlySet<string>;

	constructor(opcoes: { base: string; esperarMs: number; fetch?: typeof fetch; timeoutMs?: number; origensDeArquivos?: string[] }) {
		this.base = new URL(opcoes.base);
		this.esperarMs = opcoes.esperarMs;
		this.fetchFn = opcoes.fetch ?? fetch;
		this.timeoutMs = opcoes.timeoutMs ?? 20_000;
		const padrao = this.base.origin === new URL(SIGAA_BASE).origin ? [ARQUIVOS_UFJ] : [];
		this.origensDeArquivos = new Set((opcoes.origensDeArquivos ?? padrao).map((o) => new URL(o).origin));
	}

	get(caminhoOuUrl: string): Promise<Pagina> {
		return this.navegar(caminhoOuUrl, { method: "GET" });
	}

	postar(url: string, campos: [string, string][]): Promise<Pagina> {
		return this.navegar(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpoLatin1(campos) });
	}

	private resolver(caminhoOuUrl: string, relativoA: string = this.base.toString(), redirecionamento = false): URL {
		const u = new URL(caminhoOuUrl, relativoA);
		if (u.origin === this.base.origin) return u;
		if (redirecionamento && this.origensDeArquivos.has(u.origin)) return u;
		// Só a origem vai na mensagem: caminho e query podem levar chaves de sessão.
		throw new SigaaEstruturaError(redirecionamento ? `redirecionamento para outro endereço (${u.origin})` : `endereço fora do SIGAA (${u.origin})`);
	}

	/** Um pedido com o relógio de silêncio: `timeoutMs` sem resposta ou sem bytes do corpo, e desiste. */
	private async pedir(url: URL, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<{ res: Response; vigia: Vigia }> {
		if (this.esperarMs > 0) await new Promise((r) => setTimeout(r, this.esperarMs));
		const headers: Record<string, string> = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9", ...(init.headers ?? {}) };
		// A sessão do SIGAA só vai para o SIGAA (o servidor de arquivos não recebe cookie).
		const doSigaa = url.origin === this.base.origin;
		const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
		if (cookie && doSigaa) headers.Cookie = cookie;
		const controller = new AbortController();
		let timer = setTimeout(() => controller.abort(), this.timeoutMs);
		const vigia: Vigia = {
			reiniciar: () => {
				clearTimeout(timer);
				timer = setTimeout(() => controller.abort(), this.timeoutMs);
			},
			parar: () => clearTimeout(timer),
		};
		try {
			const res = await this.fetchFn(url, { method: init.method, headers, body: init.body, redirect: "manual", signal: controller.signal });
			for (const h of doSigaa ? res.headers.getSetCookie() : []) {
				const par = h.split(";")[0] ?? "";
				const i = par.indexOf("=");
				if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
			}
			return { res, vigia };
		} catch {
			vigia.parar();
			throw new SigaaIndisponivelError();
		}
	}

	/** Lê o corpo inteiro; o relógio recomeça a cada pedaço, então um arquivo grande
	 *  que chega devagar não é interrompido, mas uma resposta que para de chegar é. */
	private async lerCorpo(res: Response, vigia: Vigia): Promise<Uint8Array> {
		const partes: Uint8Array[] = [];
		let total = 0;
		try {
			const leitor = res.body?.getReader();
			while (leitor) {
				vigia.reiniciar();
				const { done, value } = await leitor.read();
				if (done) break;
				partes.push(value);
				total += value.length;
			}
		} catch {
			throw new SigaaIndisponivelError();
		} finally {
			vigia.parar();
		}
		const bytes = new Uint8Array(total);
		let pos = 0;
		for (const p of partes) {
			bytes.set(p, pos);
			pos += p.length;
		}
		return bytes;
	}

	private async navegar(caminhoOuUrl: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<Pagina> {
		let atual = this.resolver(caminhoOuUrl);
		let { res, vigia } = await this.pedir(atual, init);
		for (let i = 0; i < 10 && res.status >= 300 && res.status < 400; i++) {
			const loc = res.headers.get("location");
			if (!loc) break;
			vigia.parar();
			await res.body?.cancel().catch(() => {});
			atual = this.resolver(loc, atual.toString(), true);
			({ res, vigia } = await this.pedir(atual, { method: "GET" }));
		}
		if (res.status >= 300 && res.status < 400) {
			vigia.parar();
			throw new SigaaEstruturaError("redirecionamentos demais");
		}
		const bytes = await this.lerCorpo(res, vigia);
		const tipo = res.headers.get("content-type") ?? "";
		const ehPagina = tipo === "" || /html|xml/i.test(tipo);
		return { url: atual.toString(), status: res.status, tipo, bytes, html: ehPagina ? new TextDecoder(charsetDe(tipo)).decode(bytes) : "", headers: res.headers };
	}
}
