// Adaptado de sigaa-mcp (https://github.com/Pedromaia0/sigaa-mcp). Copyright (c) 2026 Pedro Maia. Licença MIT.
/**
 * AJUDANTES PARA O JSF DO SIGAA (spec SIGAA §6). Os "links" do SIGAA são
 * comandos `jsfcljs(...)` que enviam o formulário em volta com o id do
 * componente clicado e o `javax.faces.ViewState` da página atual.
 */

import { parseHTML } from "linkedom";
import type { Pagina, SigaaSessao } from "./http.ts";
import { SigaaEstruturaError } from "./erros.ts";

export interface LinkJsf {
	form: string;
	params: Record<string, string>;
}

/** O formulário e os parâmetros de um `onclick="...jsfcljs(document.getElementById('f'),{...},'')"`. */
export function linkJsf(onclick: string | null | undefined): LinkJsf | null {
	if (!onclick || !onclick.includes("jsfcljs")) return null;
	const form = /getElementById\('([^']+)'\)/.exec(onclick)?.[1];
	if (!form) return null;
	const obj = /getElementById\('[^']+'\)\s*,\s*\{([^}]*)\}/.exec(onclick)?.[1] ?? "";
	const params: Record<string, string> = {};
	for (const m of obj.matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)) params[m[1]!] = m[2]!;
	return { form, params };
}

export function documento(html: string): Document {
	return parseHTML(html).document as unknown as Document;
}

/** Os campos que o navegador enviaria do formulário, com os do comando por cima. */
export function camposDoForm(doc: Document, formId: string, extras: Record<string, string>): [string, string][] {
	const form = doc.getElementById(formId);
	const campos = new Map<string, string>();
	if (form) {
		for (const inp of Array.from(form.querySelectorAll("input"))) {
			const nome = inp.getAttribute("name");
			if (!nome) continue;
			const tipo = (inp.getAttribute("type") ?? "text").toLowerCase();
			if (["submit", "button", "image", "file", "reset"].includes(tipo)) continue;
			if ((tipo === "checkbox" || tipo === "radio") && !inp.hasAttribute("checked")) continue;
			campos.set(nome, inp.getAttribute("value") ?? "");
		}
		for (const sel of Array.from(form.querySelectorAll("select"))) {
			const nome = sel.getAttribute("name");
			if (!nome) continue;
			const op = sel.querySelector("option[selected]") ?? sel.querySelector("option");
			campos.set(nome, op?.getAttribute("value") ?? "");
		}
	}
	for (const [k, v] of Object.entries(extras)) campos.set(k, v);
	return [...campos];
}

/** Repete o clique num comando JSF da página. */
export function clicar(sessao: SigaaSessao, pagina: Pagina, link: LinkJsf): Promise<Pagina> {
	const doc = documento(pagina.html);
	const form = doc.getElementById(link.form);
	if (!form) throw new SigaaEstruturaError(`formulário ${link.form}`);
	const acao = new URL(form.getAttribute("action") || pagina.url, pagina.url).toString();
	return sessao.postar(acao, camposDoForm(doc, link.form, link.params));
}
