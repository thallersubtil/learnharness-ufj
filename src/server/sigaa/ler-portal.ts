/**
 * O PORTAL DO DISCENTE (spec SIGAA §6). As turmas vêm da lista de turmas do
 * semestre (`td.descricao`), não do quadro de atualizações: ele só mostra
 * turmas com novidade recente. Cada turma é um formulário
 * `form_acessarTurmaVirtual` com o `idTurma` num campo oculto, e todos os
 * formulários repetem o mesmo id; por isso o `idTurma` vai nos parâmetros do
 * comando, por cima do campo do primeiro formulário.
 */

import { documento, linkJsf, type LinkJsf } from "./jsf.ts";
import { limpo } from "./texto.ts";

export interface TurmaNoPortal {
	idTurma: string;
	nome: string;
	link: LinkJsf;
}

export function lerPortal(html: string): TurmaNoPortal[] {
	const doc = documento(html);
	const out: TurmaNoPortal[] = [];
	const vistos = new Set<string>();
	for (const form of Array.from(doc.querySelectorAll("td.descricao form"))) {
		const idTurma = form.querySelector('input[name="idTurma"]')?.getAttribute("value");
		const a = form.querySelector("a[onclick]");
		const link = linkJsf(a?.getAttribute("onclick"));
		if (!idTurma || !a || !link || vistos.has(idTurma)) continue;
		vistos.add(idTurma);
		out.push({ idTurma, nome: limpo(a.textContent), link: { form: link.form, params: { ...link.params, idTurma } } });
	}
	if (out.length > 0) return out;
	// Sem a lista (outra versão do portal): qualquer comando com idTurma.
	for (const a of Array.from(doc.querySelectorAll("a[onclick]"))) {
		const link = linkJsf(a.getAttribute("onclick"));
		const idTurma = link?.params.idTurma;
		if (!link || !idTurma || vistos.has(idTurma)) continue;
		vistos.add(idTurma);
		out.push({ idTurma, nome: limpo(a.textContent).replace(/\s*\(\d{4}\.\d\)\s*$/, ""), link });
	}
	return out;
}
