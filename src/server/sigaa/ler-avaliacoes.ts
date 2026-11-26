/** "DATAS DE AVALIAÇÕES" DA TURMA (spec SIGAA §6). A hora vem como está; quem
 *  decide se ela vale (HH:MM) é a montagem. */

import type { SigaaAvaliacao } from "../../core/sigaa.ts";
import { documento, linkJsf } from "./jsf.ts";
import { dataBr, limpo } from "./texto.ts";

export function lerAvaliacoes(html: string): SigaaAvaliacao[] {
	const doc = documento(html);
	const out: SigaaAvaliacao[] = [];
	for (const tr of Array.from(doc.querySelectorAll("table.listing tbody tr"))) {
		const tds = Array.from(tr.querySelectorAll("td"));
		const data = dataBr(limpo(tds[0]?.textContent));
		const sigaaId = linkJsf(tr.querySelector("a[onclick]")?.getAttribute("onclick"))?.params.id;
		if (!data || !sigaaId) continue;
		const hora = limpo(tds[1]?.textContent);
		out.push({ sigaaId, data, ...(hora ? { hora } : {}), descricao: limpo(tds[2]?.textContent) });
	}
	return out;
}
