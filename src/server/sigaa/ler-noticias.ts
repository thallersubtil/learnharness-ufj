/** AS NOTÍCIAS DA TURMA (spec chat+SIGAA §5.1): a lista (título, data e o
 *  comando "Visualizar" com o id) e o texto de uma notícia aberta. */

import { documento, linkJsf, type LinkJsf } from "./jsf.ts";
import { dataBr, limpo } from "./texto.ts";

export interface NoticiaNaLista {
	sigaaId: string;
	titulo: string;
	/** AAAA-MM-DD */
	data: string;
	link: LinkJsf;
}

export function lerNoticias(html: string): NoticiaNaLista[] {
	const doc = documento(html);
	const out: NoticiaNaLista[] = [];
	for (const tr of Array.from(doc.querySelectorAll("table.listing tbody tr"))) {
		const tds = Array.from(tr.querySelectorAll("td"));
		const link = linkJsf(tr.querySelector("a[onclick]")?.getAttribute("onclick"));
		const sigaaId = link?.params.id;
		const data = dataBr(limpo(tds[1]?.textContent));
		if (!link || !sigaaId || !data) continue;
		out.push({ sigaaId, titulo: limpo(tds[0]?.textContent), data, link });
	}
	return out;
}

/** O texto de uma notícia aberta, sem "Cadastrado por". */
export function lerTextoDaNoticia(html: string): string {
	const doc = documento(html);
	const corpo = doc.querySelector(".conteudoNoticia, td.conteudoNoticia");
	if (corpo) {
		for (const br of Array.from(corpo.querySelectorAll("br"))) br.replaceWith(" ");
		return limpo(corpo.textContent);
	}
	// Sem a célula marcada: tudo depois de "Data:" e antes de "Cadastrado por".
	const texto = limpo(doc.getElementById("conteudo")?.textContent ?? doc.body?.textContent);
	const m = /Data:\s*\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?\s*(.*?)(?:\s*Cadastrado por:.*)?$/.exec(texto);
	return m?.[1]?.trim() ?? texto;
}
