/** Formato 1 da biblioteca UFJ (spec Etapa A §7.2): tipos, validação e slugs.
 * Dados fictícios — o repositório é público. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	BibliotecaEntradaError,
	BibliotecaFormatoError,
	FORMATO_BIBLIOTECA,
	isValidCodigo,
	isValidSlug,
	parseMateria,
	parseReferencias,
	parseTurma,
	slugify,
	turmaId,
} from "../src/core/index.ts";
import { materiaValida, turmaValida } from "./helpers/biblioteca-fixtures.ts";

describe("slugs e identificadores da biblioteca", () => {
	it("slugify tira acentos, pontuação e espaços", () => {
		assert.equal(slugify("Teorema do Valor Médio"), "teorema-do-valor-medio");
		assert.equal(slugify("  L’Hôpital & Taylor "), "l-hopital-taylor");
		assert.equal(slugify("x".repeat(90)).length, 60);
	});

	it("códigos de disciplina aceitos e recusados", () => {
		assert.equal(isValidCodigo("ICE0784"), true);
		assert.equal(isValidCodigo("../x"), false);
		assert.equal(isValidCodigo("ice0784"), false);
		assert.equal(isValidCodigo(""), false);
	});

	it("slugs aceitos e recusados", () => {
		assert.equal(isValidSlug("regra-da-cadeia-2"), true);
		assert.equal(isValidSlug("Tópico 1"), false);
		assert.equal(isValidSlug("-x"), false);
		assert.equal(isValidSlug("a".repeat(81)), false);
	});

	it("turmaId junta semestre e docente", () => {
		assert.equal(turmaId("2026-2", "prof-exemplo"), "2026-2-prof-exemplo");
	});
});

describe("parse do formato 1", () => {
	it("aceita uma matéria válida e preserva os tópicos", () => {
		assert.equal(FORMATO_BIBLIOTECA, 1);
		const m = parseMateria(materiaValida());
		assert.deepEqual(m.topicos.map((t) => t.id), ["limites", "derivadas", "antigo"]);
		assert.equal(m.topicos[2]!.arquivado, true);
		assert.equal(m.topicos[1]!.prompt, "Quero entender derivadas.");
	});

	it("recusa formato mais novo com BibliotecaFormatoError", () => {
		assert.throws(() => parseMateria({ ...materiaValida(), formato: 2 }), BibliotecaFormatoError);
		assert.throws(() => parseTurma({ ...turmaValida(), formato: 2 }), BibliotecaFormatoError);
		assert.throws(() => parseReferencias({ formato: 2, arquivos: [] }), BibliotecaFormatoError);
	});

	it("recusa forma inválida com BibliotecaEntradaError em português", () => {
		assert.throws(() => parseTurma({ ...turmaValida(), aulas: [{ ordem: "x" }] }), BibliotecaEntradaError);
		assert.throws(() => parseMateria({ ...materiaValida(), topicos: [{ id: "Tópico 1", titulo: "X" }] }), BibliotecaEntradaError);
		assert.throws(() => parseMateria({ ...materiaValida(), codigo: "../x" }), BibliotecaEntradaError);
		assert.throws(() => parseMateria(null), BibliotecaEntradaError);
		assert.throws(() => parseTurma({ ...turmaValida(), avaliacoes: [{ id: "N1", nome: "N1", tipo: "chute", escopo: { topicos: [] } }] }), BibliotecaEntradaError);
	});

	it("recusa ids de tópico repetidos", () => {
		const m = materiaValida();
		m.topicos.push({ id: "limites", titulo: "Outro" });
		assert.throws(() => parseMateria(m), /repetido/);
	});

	it("aceita uma turma válida", () => {
		const t = parseTurma(turmaValida());
		assert.equal(t.avaliacoes[0]!.escopo.topicos[0], "limites");
		assert.equal(t.aulas[1]!.avaliacaoId, "N1");
	});

	it("aceita referências válidas e recusa nomes de arquivo perigosos", () => {
		const r = parseReferencias({ formato: 1, arquivos: [{ arquivo: "aula 1.pdf", topicos: ["limites"], sha256: "a".repeat(64) }] });
		assert.equal(r.arquivos[0]!.arquivo, "aula 1.pdf");
		assert.throws(() => parseReferencias({ formato: 1, arquivos: [{ arquivo: "../x.pdf", topicos: [], sha256: "a".repeat(64) }] }), BibliotecaEntradaError);
	});
});
