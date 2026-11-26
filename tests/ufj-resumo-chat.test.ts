/** Um chat novo recebe o resumo do semestre pelo chat-handler (spec chat+SIGAA
 * §5.2): o buildAgent recebe `contextoExtra` começando por "[Semestre UFJ — "
 * assim que a biblioteca tem uma turma. LH_DATA_DIR isolado; motor falso, sem
 * provedor real. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import type { AgentBuildOptions } from "../src/agent/teacher-agent.ts";

assert.equal(process.env.NODE_ENV, "test", "Rode com NODE_ENV=test; este teste não pode chamar provedores reais.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-ufj-resumo-chat-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LH_AUTH_FILE = path.join(scratch, "auth.json");
process.env.OPENROUTER_API_KEY = "test-key-presence-gate";
fs.writeFileSync(process.env.LH_AUTH_FILE, "{}");

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function motor() {
	const faux = createFauxCore({});
	faux.setResponses([fauxAssistantMessage([fauxText("Olá.")])]);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

/** Manda um texto num chat novo e devolve as opções com que o handler construiu o agente. */
async function turnoCapturando(texto: string): Promise<AgentBuildOptions> {
	const chat = chatStore.createChat("teste");
	chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	let visto: AgentBuildOptions | undefined;
	const ack = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: texto } }) }),
		(opts) => { visto = opts; return createTeacherAgent(undefined, { ...opts, engine: motor() }); },
	);
	assert.equal(ack.status, 200, await ack.text());
	const handle = runningTurn(chat.id);
	if (handle) await new Response(handle.subscribe()).text();
	assert.ok(visto, "o handler construiu o agente");
	return visto;
}

describe("resumo UFJ no chat novo", () => {
	it("sem biblioteca, contextoExtra é vazio e o prompt não tem o bloco", async () => {
		const opts = await turnoCapturando("oi");
		assert.equal(opts.contextoExtra, "");
	});

	it("com uma turma, o handler passa o bloco [Semestre UFJ e ele entra no system prompt", async () => {
		bibliotecaStore.writeMateria(materiaValida());
		bibliotecaStore.writeTurma("ICE0001", turmaValida());
		const opts = await turnoCapturando("Me ajuda a revisar Cálculo");
		assert.match(opts.contextoExtra ?? "", /^\[Semestre UFJ — \d{2}\/\d{2}\/\d{4}\]\nMatérias: ICE0001 Disciplina Teste \(2026-2\)\./);
		const prompt = createTeacherAgent(undefined, { ...opts, engine: motor() }).state.systemPrompt;
		assert.match(prompt, /\n\n---\n\n\[Semestre UFJ — /);
	});
});
