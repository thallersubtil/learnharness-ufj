/** Tela de preparação: dias, sinais por tópico e próximos passos (spec Etapa A
 * §7.5). LH_DATA_DIR isolado; dados fictícios. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-preparacao-"));
process.env.LH_DATA_DIR = TMP_DATA;

const core = await import("../src/core/index.ts");
const server = await import("../src/server/index.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");
type ChatSummary = import("../src/core/contracts.ts").ChatSummary;
type TopicoPreparacao = import("../src/core/preparacao.ts").TopicoPreparacao;

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

describe("diasAte conta por data local (foco 1)", () => {
	for (const tz of ["America/Sao_Paulo", "UTC"]) {
		it(`TZ=${tz}`, () => {
			process.env.TZ = tz;
			assert.equal(core.diasAte("2026-12-08", new Date(2026, 10, 18, 23, 30)), 20);
			assert.equal(core.diasAte("2026-11-18", new Date(2026, 10, 18, 0, 5)), 0);
			assert.equal(core.diasAte("2026-11-17", new Date(2026, 10, 18)), -1);
		});
	}
});

const sessao = (over: Partial<ChatSummary>): ChatSummary => ({
	id: "c", title: "t", createdAt: "2026-11-19", updatedAt: "2026-11-19", kind: "teach", messageCount: 1, phase: "probe",
	pendingQuestion: false, pendingProblem: false, concludedProblems: 0, ...over,
});

describe("sinaisPorTopico", () => {
	it("aula feita só na fase teach; praticado só com problema concluído", () => {
		const ufj = (topico: string) => ({ materia: "ICE0001", turma: "2026-2-prof-exemplo", avaliacao: "N1", topico });
		const sinais = core.sinaisPorTopico([
			sessao({ id: "a", ufj: ufj("t1"), phase: "probe" }),
			sessao({ id: "b", ufj: ufj("t2"), phase: "teach" }),
			sessao({ id: "c", ufj: ufj("t3"), kind: "practice", concludedProblems: 0 }),
			sessao({ id: "d", ufj: ufj("t4"), kind: "practice", concludedProblems: 2 }),
			sessao({ id: "e", ufj: { ...ufj("t2"), materia: "ICE0999" }, phase: "teach" }),
			sessao({ id: "f" }),
		], { materia: "ICE0001" });
		assert.equal(sinais.get("t1")!.aulaFeita, false);
		assert.deepEqual(sinais.get("t1")!.sessoes.map((s) => s.id), ["a"]);
		assert.equal(sinais.get("t2")!.aulaFeita, true);
		assert.deepEqual(sinais.get("t2")!.sessoes.map((s) => s.id), ["b"], "sessão de outra matéria não conta");
		assert.equal(sinais.get("t3")!.praticado, false);
		assert.equal(sinais.get("t4")!.praticado, true);
	});
});

describe("proximosPassos", () => {
	const topico = (id: string, aulaFeita: boolean, praticado: boolean) => ({ id, titulo: id.toUpperCase(), aulaFeita, praticado }) as TopicoPreparacao;
	it("primeiro aprender o que falta, depois praticar o que já teve aula, no máximo 5", () => {
		const passos = core.proximosPassos([
			topico("a", true, false), topico("b", false, false), topico("c", true, true),
			topico("d", false, false), topico("e", true, false), topico("f", false, false), topico("g", false, false),
		]);
		assert.deepEqual(passos, [
			{ tipo: "aprender", topico: "b", texto: "Aprender: B" },
			{ tipo: "aprender", topico: "d", texto: "Aprender: D" },
			{ tipo: "aprender", topico: "f", texto: "Aprender: F" },
			{ tipo: "aprender", topico: "g", texto: "Aprender: G" },
			{ tipo: "praticar", topico: "a", texto: "Praticar: A" },
		]);
	});
});

describe("preparacaoView", () => {
	const materia = {
		...materiaValida(),
		nome: "Cálculo Teste",
		topicos: [
			{ id: "t1", titulo: "Limites" },
			{ id: "t2", titulo: "Derivadas", prompt: "Quero entender derivadas do jeito do professor." },
			{ id: "t3", titulo: "Antigo", arquivado: true },
			{ id: "t4", titulo: "Continuidade" },
		],
	};
	const turma = {
		...turmaValida(),
		aulas: [
			{ ordem: 1, rotulo: "1 e 2", data: "2026-08-19", conteudo: "Continuidade", topicos: ["t4"] },
			{ ordem: 2, rotulo: "3 e 4", data: "2026-08-25", conteudo: "Limites", topicos: ["t1"] },
			{ ordem: 3, rotulo: "5 e 6", data: "2026-09-01", conteudo: "Derivadas", topicos: ["t2"] },
			{ ordem: 4, rotulo: "7 e 8", data: "2026-12-08", conteudo: "Avaliação", avaliacaoId: "N3", topicos: [] },
		],
		avaliacoes: [
			{ id: "N3", nome: "N3 — Avaliação escrita", tipo: "prova-escrita" as const, posicao: 3, data: "2026-12-08", pontos: 10, escopo: { topicos: ["t1", "t2", "t3", "t4"] } },
			{ id: "TF", nome: "Trabalho final", tipo: "trabalho" as const, escopo: { topicos: [] } },
		],
	};
	server.stores.bibliotecaStore.writeMateria(materia);
	server.stores.bibliotecaStore.writeTurma("ICE0001", turma);
	const ref = { materia: "ICE0001", turma: "2026-2-prof-exemplo", avaliacao: "N3" };
	const hoje = new Date(2026, 10, 18, 10, 0);

	it("monta os tópicos na ordem do cronograma, sem os arquivados, com os prompts", () => {
		const view = server.preparacaoView(ref, hoje);
		assert.equal(view.dias, 20);
		assert.equal(view.horas, null);
		assert.deepEqual(view.topicos.map((t) => t.id), ["t4", "t1", "t2"]);
		const t1 = view.topicos[1]!;
		assert.equal(t1.promptAprender, core.promptAprender({ materia: "ICE0001", turma: ref.turma, avaliacao: "N3", topico: "t1", materiaNome: "Cálculo Teste", docente: "Prof. Exemplo", avaliacaoNome: "N3 — Avaliação escrita", data: "2026-12-08", topicoTitulo: "Limites" }));
		assert.equal(t1.promptAprender, "Quero entender Limites para a N3 — Avaliação escrita de Cálculo Teste (08/12).");
		assert.equal(t1.promptPraticar, "Quero praticar Limites no nível da N3 — Avaliação escrita de Cálculo Teste.");
		assert.equal(view.topicos[2]!.promptAprender, "Quero entender derivadas do jeito do professor.", "o prompt curado vale para Aprender");
		assert.deepEqual(t1.ufjContext, { ...ref, topico: "t1" });
		assert.deepEqual(t1.aulas, [{ rotulo: "3 e 4", data: "2026-08-25" }]);
		assert.equal(view.passos.length, 3);
		assert.deepEqual(view.avisos, []);
	});

	it("a view traz o vínculo e o prompt da revisão da prova inteira (spec chat+SIGAA §5.4)", () => {
		const view = server.preparacaoView(ref, hoje);
		assert.deepEqual(view.revisao.ufjContext, { materia: "ICE0001", turma: ref.turma, avaliacao: "N3", origem: "prova" });
		assert.equal(view.revisao.prompt, "Quero revisar para a N3 — Avaliação escrita de Cálculo Teste (08/12).");
	});

	it("avaliação sem escopo gera aviso; id desconhecido lança", () => {
		const v = server.preparacaoView({ ...ref, avaliacao: "TF" }, hoje);
		assert.deepEqual(v.avisos, ["Esta avaliação está sem escopo. Edite o plano para escolher os tópicos."]);
		assert.throws(() => server.preparacaoView({ ...ref, avaliacao: "ZZ" }, hoje), core.BibliotecaEntradaError);
	});

	it("horas: 300 dá 400; 6 volta na view e no contexto da sessão", async () => {
		const put = (horas: unknown) => server.preparacaoPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ ...ref, horas }) }));
		assert.equal((await put(300)).status, 400);
		assert.equal((await (await put(300)).json()).error, "Informe um número de horas entre 0 e 200.");
		assert.equal((await put(6)).status, 200);
		assert.equal(server.preparacaoView(ref, hoje).horas, 6);
		const marker = server.ufjMarkerFor({ ...ref, topico: "t1" });
		assert.match(marker.content, /Tempo que o aluno tem para estudar para esta avaliação: 6 h\./);
		assert.match(marker.content, /\(falta|\(faltam|\(hoje\)|\(já passou\)/, "o contexto traz os dias até a prova");
		assert.equal((await put(null)).status, 200);
		assert.equal(server.preparacaoView(ref, hoje).horas, null);
	});

	it("turma de formato mais novo é dita como tal, não como desconhecida (revisão final, item 4)", () => {
		const dir = path.join(TMP_DATA, "biblioteca/materias/ICE0001/turmas/2030-1-futuro");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "turma.json"), JSON.stringify({ ...turmaValida(), id: "2030-1-futuro", formato: 2 }));
		assert.throws(() => server.preparacaoView({ materia: "ICE0001", turma: "2030-1-futuro", avaliacao: "N1" }, hoje), core.BibliotecaFormatoError);
		assert.throws(() => server.ufjMarkerFor({ materia: "ICE0001", turma: "2030-1-futuro", avaliacao: "N1", topico: "t1" }), core.BibliotecaFormatoError);
	});

	it("GET pela rota devolve a view; sem parâmetros dá 400", async () => {
		const ok = await server.preparacaoGetRoute(new Request(`http://localhost/api/biblioteca/preparacao?materia=ICE0001&turma=${ref.turma}&avaliacao=N3`));
		assert.equal(ok.status, 200);
		assert.equal((await ok.json()).avaliacao.id, "N3");
		assert.equal((await server.preparacaoGetRoute(new Request("http://localhost/api/biblioteca/preparacao"))).status, 400);
	});
});
