/** Marcador ufj-context e sessões criadas pela biblioteca (spec Etapa A §7.6).
 * LH_DATA_DIR isolado; dados fictícios. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-ufj-context-"));
process.env.LH_DATA_DIR = TMP_DATA;

const core = await import("../src/core/index.ts");
const { POST } = await import("../app/api/chats/route.ts");
const { stores, listChats } = await import("../src/server/index.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type Materia = import("../src/core/biblioteca.ts").Materia;
type Turma = import("../src/core/biblioteca.ts").Turma;

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

function fixture(): { materia: Materia; turma: Turma } {
	const materia: Materia = { ...materiaValida(), nome: "Cálculo Teste", topicos: [{ id: "regra-da-cadeia", titulo: "Regra da Cadeia", descricao: "Derivada de funções compostas" }, { id: "velho", titulo: "Velho", arquivado: true }] };
	const turma: Turma = {
		...turmaValida(),
		aulas: [
			{ ordem: 1, rotulo: "31 e 32", data: "2026-10-13", conteudo: "Regra da cadeia", topicos: ["regra-da-cadeia"] },
			{ ordem: 2, rotulo: "39 e 40", data: "2026-11-03", conteudo: "Avaliação", avaliacaoId: "N2", topicos: [] },
		],
		avaliacoes: [{ id: "N2", nome: "N2 — Avaliação escrita", tipo: "prova-escrita", posicao: 2, data: "2026-11-03", pontos: 10, duracaoMin: 100, escopo: { topicos: ["regra-da-cadeia"] } }],
	};
	return { materia, turma };
}

const payload = {
	materia: "ICE0001", turma: "2026-2-prof-exemplo", avaliacao: "N2", topico: "regra-da-cadeia",
	materiaNome: "Cálculo Teste", docente: "Prof. Exemplo", avaliacaoNome: "N2 — Avaliação escrita", data: "2026-11-03", topicoTitulo: "Regra da Cadeia",
};

describe("texto do contexto UFJ", () => {
	it("compõe o texto exato com materiais e horas", () => {
		const { materia, turma } = fixture();
		const texto = core.composeUfjContextText({
			materia, turma, avaliacao: turma.avaliacoes[0]!, topico: materia.topicos[0]!, aulas: [turma.aulas[0]!],
			referencias: [{ caminho: "/dados/biblioteca/aula 31.pdf", titulo: "Aula 31 — regra da cadeia" }], dias: 20, horas: 1.5,
		});
		assert.equal(texto, [
			"[Contexto UFJ] — sessão criada pela biblioteca do aluno.",
			"Disciplina: ICE0001 Cálculo Teste — Bacharelado Teste, UFJ. Professor(a): Prof. Exemplo. Semestre: 2026-2.",
			"Avaliação: N2 — Avaliação escrita — 03/11/2026 (faltam 20 dias); 10 pontos; duração 100 min.",
			"Tópico: Regra da Cadeia — Derivada de funções compostas",
			"Aulas deste tópico no cronograma:",
			"- Aula 31 e 32 (13/10): Regra da cadeia",
			"Ementa da disciplina: Limites. Derivadas.",
			"Bibliografia básica: AUTOR, A. Livro. 2020.",
			"Materiais do professor para este tópico (leia quando ajudar a alinhar a sessão):",
			"- `/dados/biblioteca/aula 31.pdf` — Aula 31 — regra da cadeia",
			"Tempo que o aluno tem para estudar para esta avaliação: 1,5 h.",
		].join("\n"));
	});

	it("linha da disciplina sem curso e sem docente (turma do SIGAA)", () => {
		const { materia, turma } = fixture();
		const texto = core.composeUfjContextText({
			materia: { ...materia, nome: "Disciplina Teste", curso: "" }, turma: { ...turma, docente: { nome: "", slug: "sigaa" } },
			avaliacao: turma.avaliacoes[0]!, topico: materia.topicos[0]!, aulas: [], referencias: [], dias: null, horas: null,
		});
		assert.equal(texto.split("\n")[1], "Disciplina: ICE0001 Disciplina Teste, UFJ. Semestre: 2026-2.");
	});

	it("omite as linhas sem dado e escreve hoje, falta 1 dia e já passou", () => {
		const { materia, turma } = fixture();
		const base = { materia: { ...materia, bibliografia: { basica: [], complementar: [], virtual: [] } }, turma, avaliacao: turma.avaliacoes[0]!, topico: materia.topicos[0]!, aulas: [turma.aulas[0]!], referencias: [], horas: null };
		const sem = core.composeUfjContextText({ ...base, dias: null });
		assert.doesNotMatch(sem, /Tempo que o aluno/);
		assert.doesNotMatch(sem, /Materiais do professor/);
		assert.doesNotMatch(sem, /Bibliografia básica/);
		assert.match(sem, /Avaliação: N2 — Avaliação escrita — 03\/11\/2026; 10 pontos/);
		assert.match(core.composeUfjContextText({ ...base, dias: 0 }), /03\/11\/2026 \(hoje\)/);
		assert.match(core.composeUfjContextText({ ...base, dias: 1 }), /\(falta 1 dia\)/);
		assert.match(core.composeUfjContextText({ ...base, dias: -3 }), /\(já passou\)/);
	});

	it("prompts de Aprender e Praticar", () => {
		assert.equal(core.promptAprender(payload), "Quero entender Regra da Cadeia para a N2 — Avaliação escrita de Cálculo Teste (03/11).");
		assert.equal(core.promptPraticar(payload), "Quero praticar Regra da Cadeia no nível da N2 — Avaliação escrita de Cálculo Teste.");
		assert.equal(core.promptAprender({ ...payload, data: undefined }), "Quero entender Regra da Cadeia para a N2 — Avaliação escrita de Cálculo Teste.");
	});
});

describe("o marcador ufj-context", () => {
	const marker = core.newUfjContextMessage(payload, "[Contexto UFJ] — texto");

	it("chega ao modelo como mensagem de usuário com o conteúdo", () => {
		const llm = core.toLlmMessages([marker] as LhMessage[]);
		assert.equal(llm.length, 1);
		assert.equal(llm[0]!.role, "user");
		assert.deepEqual((llm[0] as { content: { type: string; text: string }[] }).content, [{ type: "text", text: "[Contexto UFJ] — texto" }]);
	});

	it("aparece na tela como cartão data-ufj-context com o payload", () => {
		const view = core.projectView([marker] as LhMessage[]);
		const part = view[0]!.parts[0] as { type: string; data: unknown };
		assert.equal(part.type, "data-ufj-context");
		assert.deepEqual(part.data, payload);
	});

	it("é neutro como causa de entrada", () => {
		assert.equal(core.nativeInputCause(marker as never, []), "neutral");
	});

	it("ufjContextOf lê o payload", () => {
		assert.deepEqual(core.ufjContextOf([marker] as LhMessage[]), payload);
		assert.equal(core.ufjContextOf([]), null);
	});
});

describe("concludedProblemCount", () => {
	it("conta conclusões limpas e ignora as dispensadas", () => {
		const call = (id: string, outcome: string): LhMessage => ({ id: `m-${id}`, role: "assistant", content: [{ type: "toolCall", id, name: "conclude", arguments: { outcome } }], api: "faux", provider: "f", model: "f", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse", timestamp: 0 }) as LhMessage;
		const result = (id: string, isError = false): LhMessage => ({ id: `r-${id}`, role: "toolResult", toolCallId: id, toolName: "conclude", content: [{ type: "text", text: "ok" }], isError, timestamp: 0 }) as LhMessage;
		const msgs = [call("a", "solved"), result("a"), call("b", "dismissed"), result("b"), call("c", "solved"), result("c", true)];
		assert.equal(core.concludedProblemCount(msgs), 1);
	});
});

describe("POST /api/chats com ufjContext", () => {
	const { materia, turma } = fixture();
	stores.bibliotecaStore.writeMateria(materia);
	stores.bibliotecaStore.writeTurma("ICE0001", turma);
	const ref = { materia: "ICE0001", turma: "2026-2-prof-exemplo", avaliacao: "N2", topico: "regra-da-cadeia" };
	const post = (body: unknown) => POST(new Request("http://localhost/api/chats", { method: "POST", body: JSON.stringify(body) }));

	it("uma aula com ufjContext válido começa com o marcador", async () => {
		const res = await post({ title: "Quero entender", ufjContext: ref });
		assert.equal(res.status, 200);
		const { id } = await res.json();
		const msgs = stores.chatStore.getChat(id)!.messages;
		assert.equal(msgs.length, 1);
		const m = msgs[0] as { customType: string; content: string; details: { topicoTitulo: string } };
		assert.equal(m.customType, "ufj-context");
		assert.match(m.content, /^\[Contexto UFJ\]/);
		assert.equal(m.details.topicoTitulo, "Regra da Cadeia");
	});

	it("tópico inexistente ou arquivado dá 400 (foco 5)", async () => {
		assert.equal((await post({ title: "x", ufjContext: { ...ref, topico: "nao-existe" } })).status, 400);
		assert.equal((await post({ title: "x", ufjContext: { ...ref, topico: "velho" } })).status, 400);
		assert.equal((await post({ title: "x", ufjContext: { materia: 3 } })).status, 400);
	});

	it("prática usa as proposições nascidas nas sessões do tópico", async () => {
		const aula = await (await post({ title: "Aula", ufjContext: ref })).json();
		stores.graphStore.appendNode({ id: "p1", name: "Regra da cadeia", statement: "(f∘g)' = f'(g)·g'", aliases: [], createdAt: "2026-11-19T00:00:00.000Z", provenance: [{ chatId: aula.id, messageId: "m1" }] });
		stores.graphStore.appendNode({ id: "p2", name: "Outra", statement: "Fora do tópico", aliases: [], createdAt: "2026-11-19T00:00:00.000Z", provenance: [{ chatId: "outra-sessao", messageId: "m1" }] });
		const res = await post({ title: "Praticar", kind: "practice", ufjContext: ref });
		const { id } = await res.json();
		const msgs = stores.chatStore.getChat(id)!.messages as { customType: string; details: { propositions?: { id: string }[] } }[];
		assert.deepEqual(msgs.map((m) => m.customType), ["ufj-context", "graph-context"]);
		assert.deepEqual(msgs[1]!.details.propositions!.map((p) => p.id), ["p1"]);
	});

	it("a lista de sessões traz o vínculo ufj e os problemas concluídos", async () => {
		const linha = listChats().find((c) => c.ufj?.topico === "regra-da-cadeia");
		assert.ok(linha);
		assert.equal(linha.ufj!.avaliacao, "N2");
		assert.equal(linha.concludedProblems, 0);
	});
});
