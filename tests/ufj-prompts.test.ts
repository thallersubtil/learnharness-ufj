/** IA em português e fragmento de contexto UFJ (spec Etapa A §7.12). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { composeSideChatInstructions } from "../src/agent/side-chat.ts";
import { EXTRACTOR_INSTRUCTIONS, NOTES_EXTRACTOR_INSTRUCTIONS } from "../src/agent/subagents/extraction.ts";

const LINHA_EXTRACAO = "Escreva o nome e o enunciado de cada proposição em português do Brasil, mesmo que a fonte esteja em outra língua.";
const LINHA_VISUAL = "Todo texto visível ao aluno (títulos, rótulos, legendas, botões, mensagens) é em português do Brasil.";

describe("fragmentos UFJ na composição", () => {
	for (const kind of ["teacher", "prober", "practice"] as const) {
		it(`${kind} recebe Idioma e Contexto UFJ`, () => {
			const text = composeInstructions(kind);
			assert.match(text, /^# Idioma$/m);
			assert.match(text, /^# Contexto UFJ$/m);
			assert.ok(text.indexOf("# Idioma") < text.indexOf("# Contexto UFJ"));
		});
	}

	it("perguntas laterais recebem Idioma, mas não o Contexto UFJ", () => {
		const text = composeSideChatInstructions();
		assert.match(text, /^# Idioma$/m);
		assert.doesNotMatch(text, /# Contexto UFJ/);
	});
});

describe("saída dos workers em português", () => {
	it("a extração escreve as proposições em português", () => {
		assert.ok(EXTRACTOR_INSTRUCTIONS.includes(LINHA_EXTRACAO));
		assert.ok(NOTES_EXTRACTOR_INSTRUCTIONS.includes(LINHA_EXTRACAO));
	});

	for (const file of ["src/agent/subagents/visual-maker.ts", "src/agent/subagents/demo-builder.ts"]) {
		it(`${file} pede texto visível em português`, () => {
			assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").includes(LINHA_VISUAL));
		});
	}
});
