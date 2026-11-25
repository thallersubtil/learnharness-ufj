/** AS TAREFAS DA TURMA (spec chat+SIGAA §5.1). A listagem vem em pares de
 *  linhas: a primeira com título, período, nota e envios; a segunda com as
 *  instruções e, às vezes, "Baixar arquivo". */

import type { Tarefa } from "../../core/biblioteca.ts";
import { documento } from "./jsf.ts";
import { dataBr, limpo } from "./texto.ts";

const PERIODO = /de\s+(\d{2}\/\d{2}\/\d{4})(?:\s+às\s+(\d{2})h(\d{2}))?\s+a\s+(\d{2}\/\d{2}\/\d{4})(?:\s+às\s+(\d{2})h(\d{2}))?/;

export function lerTarefas(html: string): Tarefa[] {
	const doc = documento(html);
	const out: Tarefa[] = [];
	const linhas = Array.from(doc.querySelectorAll("table.listing > tbody > tr"));
	for (let i = 0; i < linhas.length; i++) {
		const tr = linhas[i]!;
		const titulo = limpo(tr.querySelector("td.first")?.textContent);
		const periodo = PERIODO.exec(limpo(tr.textContent));
		if (!titulo || !periodo) continue;
		const t: Tarefa = { titulo, instrucoes: "", temArquivo: false };
		const inicio = dataBr(periodo[1]!);
		const fim = dataBr(periodo[4]!);
		if (inicio) t.inicio = inicio;
		if (fim) t.fim = fim;
		if (periodo[5] && periodo[6]) t.hora = `${periodo[5]}:${periodo[6]}`;
		// A linha seguinte traz as instruções (sem o link de anexo) e o anexo.
		const seguinte = linhas[i + 1];
		if (seguinte && !PERIODO.test(limpo(seguinte.textContent))) {
			const celula = seguinte.querySelector("td");
			const anexo = Array.from(celula?.querySelectorAll("a") ?? []).find((a) => /baixar/i.test(a.textContent ?? "") || /verProducao/.test(a.getAttribute("href") ?? ""));
			t.temArquivo = !!anexo;
			anexo?.remove();
			t.instrucoes = limpo(celula?.textContent);
			i++;
		}
		out.push(t);
	}
	return out;
}
