/** Salvar, listar e editar planos (spec Etapa A §7.3, passos 4–5) com a regra
 * dos tópicos arquivados. LH_DATA_DIR isolado; dados fictícios. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-biblioteca-routes-"));
process.env.LH_DATA_DIR = TMP_DATA;

const server = await import("../src/server/index.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");
type Materia = import("../src/core/biblioteca.ts").Materia;
type Turma = import("../src/core/biblioteca.ts").Turma;

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));
beforeEach(() => fs.rmSync(path.join(TMP_DATA, "biblioteca"), { recursive: true, force: true }));

let sessoes: string[] = [];
const svc = server.createBibliotecaService({ biblioteca: bibliotecaStore, topicosEmSessoes: () => sessoes });
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49]);

/** Matéria com t1..t3 e turma cujas aulas usam t1, t2, t3. */
function rascunho(): { materia: Materia; turma: Turma } {
	const materia = { ...materiaValida(), topicos: [{ id: "t1", titulo: "Um" }, { id: "t2", titulo: "Dois" }, { id: "t3", titulo: "Três" }] };
	const turma = turmaValida();
	turma.aulas = [
		{ ordem: 1, rotulo: "1", conteudo: "Um", topicos: ["t1"] },
		{ ordem: 2, rotulo: "2", conteudo: "Dois", topicos: ["t2"] },
		{ ordem: 3, rotulo: "3", conteudo: "Três", topicos: ["t3"] },
	];
	turma.avaliacoes = [{ id: "N1", nome: "N1", tipo: "prova-escrita", posicao: 1, escopo: { topicos: ["t1", "t2", "t3"] } }];
	return { materia, turma };
}

function planoRequest(dados: unknown, pdf: Uint8Array<ArrayBuffer> = PDF): Request {
	const form = new FormData();
	form.append("dados", typeof dados === "string" ? dados : JSON.stringify(dados));
	form.append("plano", new File([pdf], "plano.pdf", { type: "application/pdf" }));
	return new Request("http://localhost/api/biblioteca/plano", { method: "POST", body: form });
}

describe("salvar e listar", () => {
	it("salvar e depois listar mostra a matéria com 1 turma", async () => {
		const res = await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { codigo: "ICE0001", turma: "2026-2-prof-exemplo" });
		const lista = await (await server.listarRoute(svc)).json();
		assert.equal(lista.materias.length, 1);
		assert.equal(lista.materias[0].materia.codigo, "ICE0001");
		assert.deepEqual(lista.materias[0].turmas.map((t: Turma) => t.id), ["2026-2-prof-exemplo"]);
		assert.ok(bibliotecaStore.planoPdfPath("ICE0001", "2026-2-prof-exemplo"));
	});

	it("salvar de novo sem substituir dá 409 turma_existe (foco 3)", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const res = await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		assert.equal(res.status, 409);
		assert.deepEqual(await res.json(), { error: "Esta turma já existe na biblioteca.", code: "turma_existe" });
	});

	it("substituir: o tópico removido citado por sessão volta arquivado; sem sessão, some (foco 3)", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const semT3 = rascunho();
		semT3.materia.topicos = semT3.materia.topicos.filter((t) => t.id !== "t3");
		semT3.turma.aulas = semT3.turma.aulas.filter((a) => a.ordem !== 3);
		semT3.turma.avaliacoes[0]!.escopo.topicos = ["t1", "t2"];

		sessoes = ["t3"];
		assert.equal((await server.salvarPlanoRoute(planoRequest({ ...semT3, substituir: true }), svc)).status, 200);
		const t3 = bibliotecaStore.readMateria("ICE0001")!.topicos.find((t) => t.id === "t3");
		assert.deepEqual(t3, { id: "t3", titulo: "Três", arquivado: true });

		sessoes = [];
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: true }), svc);
		await server.salvarPlanoRoute(planoRequest({ ...semT3, substituir: true }), svc);
		assert.equal(bibliotecaStore.readMateria("ICE0001")!.topicos.find((t) => t.id === "t3"), undefined);
	});

	it("dados que não são JSON dão 400", async () => {
		const res = await server.salvarPlanoRoute(planoRequest("{ não é json"), svc);
		assert.equal(res.status, 400);
	});

	it("plano sem PDF válido dá 400", async () => {
		const res = await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }, new Uint8Array([1, 2, 3])), svc);
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, "O arquivo não é um PDF.");
	});

	it("turma que cita tópico fora da matéria dá 400 e nada é gravado", async () => {
		const r = rascunho();
		r.turma.aulas[0]!.topicos = ["fantasma"];
		const res = await server.salvarPlanoRoute(planoRequest({ ...r, substituir: false }), svc);
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /fantasma/);
		assert.equal(bibliotecaStore.readMateria("ICE0001"), null);
	});
});

describe("editar matéria e turma", () => {
	it("PUT da matéria que renomeia t1 mantém o id", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const m = bibliotecaStore.readMateria("ICE0001")!;
		m.topicos[0]!.titulo = "Um, renomeado";
		const res = await server.materiaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(m) }), "ICE0001", svc);
		assert.equal(res.status, 200);
		assert.deepEqual(bibliotecaStore.readMateria("ICE0001")!.topicos[0], { id: "t1", titulo: "Um, renomeado" });
	});

	it("PUT da matéria que tira um tópico usado pela turma o arquiva", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const m = bibliotecaStore.readMateria("ICE0001")!;
		m.topicos = m.topicos.filter((t) => t.id !== "t2");
		await server.materiaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(m) }), "ICE0001", svc);
		assert.equal(bibliotecaStore.readMateria("ICE0001")!.topicos.find((t) => t.id === "t2")!.arquivado, true);
	});

	it("PUT da turma que ainda cita um tópico arquivado salva e tira a referência (revisão final, item 1)", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const m = bibliotecaStore.readMateria("ICE0001")!;
		m.topicos = m.topicos.filter((t) => t.id !== "t2");
		await server.materiaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(m) }), "ICE0001", svc);
		const t = bibliotecaStore.readTurma("ICE0001", "2026-2-prof-exemplo")!; // ainda cita t2 (arquivado)
		const res = await server.turmaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(t) }), "ICE0001", "2026-2-prof-exemplo", svc);
		assert.equal(res.status, 200);
		const salva = bibliotecaStore.readTurma("ICE0001", "2026-2-prof-exemplo")!;
		assert.ok(!salva.aulas.some((a) => a.topicos.includes("t2")));
		assert.deepEqual(salva.avaliacoes[0]!.escopo.topicos, ["t1", "t3"]);
	});

	it("PUT da turma com escopo citando tópico inexistente dá 400", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const t = bibliotecaStore.readTurma("ICE0001", "2026-2-prof-exemplo")!;
		t.avaliacoes[0]!.escopo.topicos = ["inexistente"];
		const res = await server.turmaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(t) }), "ICE0001", "2026-2-prof-exemplo", svc);
		assert.equal(res.status, 400);
	});

	it("PUT com código diferente do endereço dá 400", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const m = { ...bibliotecaStore.readMateria("ICE0001")!, codigo: "ICE0002" };
		const res = await server.materiaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(m) }), "ICE0001", svc);
		assert.equal(res.status, 400);
	});

	it("GET de matéria e turma; inexistente dá 404", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const m = await (await server.materiaGetRoute("ICE0001", svc)).json();
		assert.equal(m.materia.codigo, "ICE0001");
		assert.equal(m.turmas.length, 1);
		const t = await (await server.turmaGetRoute("ICE0001", "2026-2-prof-exemplo", svc)).json();
		assert.equal(t.turma.id, "2026-2-prof-exemplo");
		assert.deepEqual(t.referencias, { formato: 1, arquivos: [] });
		assert.equal((await server.materiaGetRoute("ICE0999", svc)).status, 404);
		assert.equal((await server.turmaGetRoute("ICE0001", "2025-1-ninguem", svc)).status, 404);
	});
});

describe("problemas visíveis (revisão final, item 4)", () => {
	it("uma turma corrompida aparece nos problemas em vez de sumir", async () => {
		await server.salvarPlanoRoute(planoRequest({ ...rascunho(), substituir: false }), svc);
		const dir = path.join(TMP_DATA, "biblioteca/materias/ICE0001/turmas/2025-1-outra-pessoa");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "turma.json"), "{ quebrado");
		const lista = await (await server.listarRoute(svc)).json();
		assert.deepEqual(lista.materias[0].turmas.map((t: Turma) => t.id), ["2026-2-prof-exemplo"]);
		assert.ok(lista.problemas.some((p: string) => p.startsWith("ICE0001/2025-1-outra-pessoa")), JSON.stringify(lista.problemas));
	});
});
