/** A LISTAGEM DE ARQUIVOS DA TURMA (spec SIGAA §6): título, descrição, tópico
 *  de aula e o comando de download com o `id` do arquivo. */

import type { SigaaArquivo } from "../../core/sigaa.ts";
import { documento, linkJsf, type LinkJsf } from "./jsf.ts";
import { limpo } from "./texto.ts";

export interface ArquivoNaLista extends SigaaArquivo {
	link: LinkJsf;
}

export function lerArquivos(html: string): ArquivoNaLista[] {
	const doc = documento(html);
	const out: ArquivoNaLista[] = [];
	for (const tr of Array.from(doc.querySelectorAll("tr"))) {
		const link = linkJsf(tr.querySelector("a[onclick]")?.getAttribute("onclick"));
		const sigaaId = link?.params.id;
		if (!link || !sigaaId || link.form === "formMenu") continue;
		const tds = Array.from(tr.querySelectorAll("td"));
		if (tds.length < 3) continue;
		out.push({ sigaaId, titulo: limpo(tds[0]?.textContent), descricao: limpo(tds[1]?.textContent), topicoDeAula: limpo(tds[2]?.textContent), link });
	}
	return out;
}
