/** Campos do SIGAA na turma, nas provas e nas referências (spec SIGAA §7.4).
 * Todos opcionais: o formato da biblioteca continua 1. Dados fictícios. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReferencias, parseTurma, type Turma } from "../src/core/index.ts";
import { turmaValida } from "./helpers/biblioteca-fixtures.ts";

function turmaComSigaa(): Turma {
	const t = turmaValida();
	return {
		...t,
		sigaa: { idTurma: "123", sufixo: "TA", sincronizadoEm: "2026-11-24T12:00:00.000Z" },
		aulas: [{ ...t.aulas[0]!, sigaa: { titulo: "Pilhas", fim: "2026-08-26", prova: true } }, t.aulas[1]!],
		avaliacoes: [{ ...t.avaliacoes[0]!, origemData: "sigaa", sigaaId: "999", hora: "20:45", escopoManual: { incluidos: ["limites"], excluidos: [] } }],
	};
}

describe("campos do SIGAA", () => {
	it("ida e volta preserva os campos novos", () => {
		const t = turmaComSigaa();
		const lida = parseTurma(JSON.parse(JSON.stringify(t)));
		assert.deepEqual(lida.sigaa, { idTurma: "123", sufixo: "TA", sincronizadoEm: "2026-11-24T12:00:00.000Z" });
		assert.deepEqual(lida.aulas[0]!.sigaa, { titulo: "Pilhas", fim: "2026-08-26", prova: true });
		const av = lida.avaliacoes[0]!;
		assert.equal(av.origemData, "sigaa");
		assert.equal(av.sigaaId, "999");
		assert.equal(av.hora, "20:45");
		assert.deepEqual(av.escopoManual, { incluidos: ["limites"], excluidos: [] });
		assert.deepEqual(lida, t);
	});

	it("recusa origem desconhecida, hora fora de HH:MM e id de tópico inválido no escopo manual", () => {
		const base = turmaComSigaa();
		const com = (over: Record<string, unknown>) => ({ ...base, avaliacoes: [{ ...base.avaliacoes[0]!, ...over }] });
		assert.throws(() => parseTurma(com({ origemData: "palpite" })), /origemData/);
		assert.throws(() => parseTurma(com({ hora: "53" })), /hora/);
		assert.throws(() => parseTurma(com({ escopoManual: { incluidos: ["Não Vale"], excluidos: [] } })), /não é um id de tópico válido/);
	});

	it("referência guarda sigaaId e aula", () => {
		const r = parseReferencias({ formato: 1, arquivos: [{ arquivo: "a.pdf", topicos: [], sha256: "0".repeat(64), sigaaId: "55", aula: 3 }] });
		assert.equal(r.arquivos[0]!.sigaaId, "55");
		assert.equal(r.arquivos[0]!.aula, 3);
	});

	it("turma sem os campos novos continua igual", () => {
		assert.deepEqual(parseTurma(turmaValida()), turmaValida());
	});
});
