/**
 * A PÁGINA PRINCIPAL DA TURMA (spec SIGAA §6): cabeçalho, tópicos de aula,
 * menu e o autor da última notícia.
 */

import { nomeDeDisciplina, type SigaaTopicoDeAula } from "../../core/sigaa.ts";
import { SigaaEstruturaError } from "./erros.ts";
import { documento, linkJsf, type LinkJsf } from "./jsf.ts";
import { dataBr, limpo } from "./texto.ts";

export interface CabecalhoTurma {
	codigo: string;
	nome: string;
	/** "2026-2" */
	semestre: string;
	sufixo?: string;
}

/** "ICE0001 - " + "CÁLCULO TESTE" + " (2026 .2 - TA) ". */
export function lerCabecalho(html: string): CabecalhoTurma {
	const doc = documento(html);
	const codigo = limpo(doc.getElementById("linkCodigoTurma")?.textContent).replace(/\s*-\s*$/, "");
	const nome = limpo(doc.getElementById("linkNomeTurma")?.textContent);
	const periodo = limpo(doc.getElementById("linkPeriodoTurma")?.textContent);
	const m = /\(\s*(\d{4})\s*\.\s*(\d)\s*(?:-\s*([A-Za-z0-9]+)\s*)?\)/.exec(periodo);
	if (!codigo || !nome || !m) throw new SigaaEstruturaError("cabeçalho da turma");
	return { codigo, nome, semestre: `${m[1]}-${m[2]}`, ...(m[3] ? { sufixo: m[3] } : {}) };
}

const PERIODO = /\s*\((\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\d{2}\/\d{2}\/\d{4}))?\)\s*$/;

export function lerTopicos(html: string): SigaaTopicoDeAula[] {
	const doc = documento(html);
	return Array.from(doc.querySelectorAll(".topico-aula")).map((t) => {
		const bruto = limpo(t.querySelector(".titulo")?.textContent);
		const m = PERIODO.exec(bruto);
		const titulo = m ? bruto.slice(0, m.index).trim() : bruto;
		const conteudo = t.querySelector(".conteudotopico");
		if (conteudo) for (const el of Array.from(conteudo.querySelectorAll(".item, script, style, .drag_indicator"))) el.remove();
		const inicio = m ? dataBr(m[1]!) : undefined;
		const fim = m?.[2] ? dataBr(m[2]) : undefined;
		return { titulo, ...(inicio ? { inicio } : {}), ...(fim ? { fim } : {}), descricao: limpo(conteudo?.textContent) };
	});
}

export interface ItemDeMenu {
	rotulo: string;
	link: LinkJsf;
}

export function lerMenu(html: string): ItemDeMenu[] {
	const doc = documento(html);
	const out: ItemDeMenu[] = [];
	for (const a of Array.from(doc.querySelectorAll("a[onclick]"))) {
		const link = linkJsf(a.getAttribute("onclick"));
		const rotulo = limpo(a.textContent);
		if (link?.form === "formMenu" && rotulo) out.push({ rotulo, link });
	}
	return out;
}

/** Quem publicou a última notícia ("Cadastrado por:"), em Nome Próprio. */
export function lerDocente(html: string): string | undefined {
	const texto = limpo(documento(html).getElementById("ultimaNoticia")?.textContent);
	const nome = /Cadastrado por:\s*(.+)$/.exec(texto)?.[1]?.trim();
	return nome ? nomeDeDisciplina(nome) : undefined;
}
