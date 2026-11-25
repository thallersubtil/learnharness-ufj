/** A ferramenta `ufj` (spec chat+SIGAA §5.3): a IA consulta matérias, provas,
 * tarefas, notícias e arquivos. Deps falsas; registro nos três agentes. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobStore } from "../src/core/ports.ts";
import { createProberTools, createTeacherTools } from "../src/agent/tools.ts";
import { practiceTools } from "../src/agent/tools/practice.ts";
import { ufjTool, type UfjToolDeps } from "../src/agent/tools/ufj.ts";

const deps: UfjToolDeps = {
	materias: () => "ICE0001 Cálculo Teste (2026-2): provas: 2ª unidade 03/12 (do SIGAA)",
	materia: (codigo) => (codigo === "ICE0001" ? "ICE0001 Cálculo Teste (2026-2)\nArquivos:\n- Lista — /dados/lista.pdf" : null),
	noticia: (codigo, id) => (codigo === "ICE0001" && id === "8001" ? "Revisão (20/11/2026)\nSala 2." : null),
};
const executar = (input: Record<string, unknown>) => ufjTool(deps).execute("call-1", input as never, undefined as never, undefined as never) as Promise<unknown>;
const texto = async (input: Record<string, unknown>) => {
	const r = (await executar(input)) as { content?: { text?: string }[]; text?: string } | string;
	if (typeof r === "string") return r;
	return r.text ?? r.content?.map((c) => c.text ?? "").join("") ?? JSON.stringify(r);
};

const stubJobStore = { createJob: (() => ({})) as never, getJob: (() => undefined) as never, listJobs: (() => []) as never, updateJob: (() => {}) as never } as unknown as JobStore;
const chatStore = { getChat: () => null } as never;

describe("ferramenta ufj", () => {
	it("materias devolve o texto", async () => {
		assert.match(await texto({ acao: "materias" }), /Cálculo Teste/);
	});

	// Erros saem como rejeição (o laço do agente os devolve ao modelo como resultado de erro).
	it("materia sem codigo dá erro em português; desconhecida também", async () => {
		await assert.rejects(executar({ acao: "materia" }), /Informe o código da matéria\./);
		await assert.rejects(executar({ acao: "materia", codigo: "ICE9999" }), /Matéria desconhecida: ICE9999\./);
		assert.match(await texto({ acao: "materia", codigo: "ice0001" }), /\/dados\/lista\.pdf/);
	});

	it("noticia inexistente", async () => {
		await assert.rejects(executar({ acao: "noticia", codigo: "ICE0001", sigaaId: "zzz" }), /Notícia não encontrada\./);
		await assert.rejects(executar({ acao: "noticia", codigo: "ICE0001" }), /Informe o código da matéria e o id da notícia\./);
		assert.match(await texto({ acao: "noticia", codigo: "ICE0001", sigaaId: "8001" }), /Sala 2\./);
	});

	it("a descrição da ferramenta é em português", () => {
		assert.match(ufjTool(deps).description, /matérias/);
		assert.doesNotMatch(ufjTool(deps).description, /\b(the|and|with)\b/);
	});

	it("o professor, a sonda e a prática registram a ferramenta quando há deps, e não registram sem", () => {
		const base = { chatId: "c1", chatStore, deliver: () => {}, jobStore: stubJobStore, spawn: () => {} };
		assert.ok("ufj" in createProberTools({ ...base, ufj: deps } as never));
		assert.ok(!("ufj" in createProberTools(base as never)));
		assert.ok("ufj" in createTeacherTools({ ...base, ufj: deps } as never));
		assert.ok(!("ufj" in createTeacherTools(base as never)));
		assert.ok("ufj" in practiceTools({ chatId: "c1", chatStore, ufj: deps }));
		assert.ok(!("ufj" in practiceTools({ chatId: "c1", chatStore })));
	});
});
