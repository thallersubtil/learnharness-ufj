/** O resumo do semestre entra no fim do system prompt de todo chat e da
 * conversa lateral (spec chat+SIGAA §5.2). LH_DATA_DIR isolado. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-ufj-resumo-prompt-"));
process.env.LH_DATA_DIR = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { composeSideChatInstructions } = await import("../src/agent/side-chat.ts");
const { resumoUfj } = await import("../src/server/ufj-resumo.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");

const engine = () => {
	const faux = createFauxCore({});
	return { model: faux.getModel(), streamFn: faux.streamSimple };
};
const BLOCO = "[Semestre UFJ — teste]\nMatérias: ICE0001 Disciplina Teste (2026-2).";

describe("resumo no prompt", () => {
	it("o system prompt do professor recebe o resumo depois de todos os fragmentos", () => {
		// A sonda e a prática passam pelo mesmo baseAgentOptions; o professor é o que se constrói sem contexto de ferramentas.
		const prompt = createTeacherAgent(undefined, { engine: engine(), contextoExtra: BLOCO }).state.systemPrompt;
		const i = prompt.indexOf(`\n\n---\n\n${BLOCO}`);
		assert.ok(i > 0, prompt.slice(-300));
		assert.ok(i > prompt.indexOf("# Contexto UFJ"), "o bloco vem depois do fragmento de contexto");
	});

	it("sem contextoExtra (ou vazio) o prompt é idêntico ao de hoje", () => {
		const a = createTeacherAgent(undefined, { engine: engine() }).state.systemPrompt;
		const b = createTeacherAgent(undefined, { engine: engine(), contextoExtra: "" }).state.systemPrompt;
		assert.equal(a, b);
		assert.doesNotMatch(a, /\[Semestre UFJ — /, "sem biblioteca, nenhum bloco de resumo");
	});

	it("a conversa lateral recebe o resumo", () => {
		const sem = composeSideChatInstructions();
		const com = composeSideChatInstructions({}, BLOCO);
		assert.equal(com, `${sem}\n\n---\n\n${BLOCO}`);
		assert.equal(composeSideChatInstructions({}, ""), sem);
	});

	it("o fragmento de contexto UFJ explica o bloco e a ferramenta", () => {
		const prompt = createTeacherAgent(undefined, { engine: engine() }).state.systemPrompt;
		assert.match(prompt, /Todo chat começa com um bloco "\[Semestre UFJ\]"/);
		assert.match(prompt, /Nunca diga que não há material sem ter consultado\./);
	});

	it("resumoUfj devolve '' sem biblioteca e o bloco com uma turma", () => {
		assert.equal(resumoUfj(new Date(2026, 10, 25)), "");
		bibliotecaStore.writeMateria(materiaValida());
		bibliotecaStore.writeTurma("ICE0001", turmaValida());
		const r = resumoUfj(new Date(2026, 10, 25));
		assert.match(r, /^\[Semestre UFJ — 25\/11\/2026\]\nMatérias: ICE0001 Disciplina Teste \(2026-2\)\./);
	});
});
