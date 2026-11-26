/** Tarefas e notícias na turma (spec chat+SIGAA §5.1). Campos opcionais; o
 * formato continua 1. Dados fictícios. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTurma, type Turma } from "../src/core/index.ts";
import { turmaValida } from "./helpers/biblioteca-fixtures.ts";

function turmaComTarefas(): Turma {
	return {
		...turmaValida(),
		tarefas: [{ titulo: "Lista 3", inicio: "2026-11-20", fim: "2026-11-26", hora: "23:59", instrucoes: "Resolva os exercícios 1 a 5.", temArquivo: true }],
		noticias: [{ sigaaId: "8001", titulo: "Revisão na sexta", data: "2026-11-20", texto: "Teremos revisão na sexta, sala 2." }, { sigaaId: "8002", titulo: "Sem aula hoje", data: "2026-11-18" }],
	};
}

describe("tarefas e notícias na turma", () => {
	it("ida e volta preserva tarefas e notícias", () => {
		const t = turmaComTarefas();
		assert.deepEqual(parseTurma(JSON.parse(JSON.stringify(t))), t);
	});

	it("turma sem os campos continua igual", () => {
		assert.deepEqual(parseTurma(turmaValida()), turmaValida());
	});

	it("data de tarefa fora do formato dá erro", () => {
		const t = turmaComTarefas();
		t.tarefas![0]!.fim = "26/11/2026";
		assert.throws(() => parseTurma(t), /AAAA-MM-DD/);
		const n = turmaComTarefas();
		n.noticias![0]!.data = "20/11";
		assert.throws(() => parseTurma(n), /AAAA-MM-DD/);
	});
});
