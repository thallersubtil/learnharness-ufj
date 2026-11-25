/** Rotas para mudar a data de uma prova, adicionar prova e escolher o conteúdo
 * (spec SIGAA §7.5–7.6). LH_DATA_DIR isolado; dados fictícios. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sigaa-provas-"));
process.env.LH_DATA_DIR = TMP_DATA;

const server = await import("../src/server/index.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { montarDoSigaa } = await import("../src/core/index.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const svc = server.createBibliotecaService({ biblioteca: bibliotecaStore, topicosEmSessoes: () => [] });
const TURMA = "2026-2-turma-ta";

beforeEach(() => {
	fs.rmSync(path.join(TMP_DATA, "biblioteca"), { recursive: true, force: true });
	const m = montarDoSigaa(
		{
			idTurma: "1001", codigo: "ICE0001", nome: "DISCIPLINA TESTE", semestre: "2026-2", sufixo: "TA",
			topicos: [
				{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" },
				{ titulo: "Avaliação da aprendizagem", inicio: "2026-09-03", fim: "2026-09-03", descricao: "" },
				{ titulo: "Derivadas", inicio: "2026-09-04", fim: "2026-09-04", descricao: "" },
				{ titulo: "Regra da cadeia", inicio: "2026-09-05", fim: "2026-09-05", descricao: "" },
			],
			avaliacoes: [{ sigaaId: "999", data: "2026-09-10", descricao: "2ª unidade" }],
			arquivos: [],
		},
		{ materia: null, turma: null, referencias: { formato: 1, arquivos: [] } },
		"2026-09-01T12:00:00.000Z",
	);
	bibliotecaStore.writeMateria(m.materia);
	bibliotecaStore.writeTurma("ICE0001", m.turma);
});

const put = (corpo: unknown, prova = "sigaa-999") =>
	server.provaPutRoute(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(corpo) }), "ICE0001", TURMA, prova, svc);
const post = (corpo: unknown) => server.provaPostRoute(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(corpo) }), "ICE0001", TURMA, svc);
const provaNoDisco = (id = "sigaa-999") => bibliotecaStore.readTurma("ICE0001", TURMA)!.avaliacoes.find((a) => a.id === id);

describe("rotas das provas", () => {
	it("PUT data grava e marca à mão", async () => {
		const res = await put({ data: "2026-09-04" });
		assert.equal(res.status, 200);
		assert.equal(provaNoDisco()!.data, "2026-09-04");
		assert.equal(provaNoDisco()!.origemData, "manual");
		assert.deepEqual(provaNoDisco()!.escopo.topicos, ["derivadas"]);
	});

	it("PUT data null apaga", async () => {
		assert.equal((await put({ data: null })).status, 200);
		assert.equal(provaNoDisco()!.data, undefined);
	});

	it("PUT topicos grava as escolhas", async () => {
		const res = await put({ topicos: ["limites", "derivadas"] });
		assert.equal(res.status, 200);
		assert.deepEqual(provaNoDisco()!.escopo.topicos, ["derivadas", "limites"]);
		assert.deepEqual(provaNoDisco()!.escopoManual, { incluidos: ["limites"], excluidos: ["regra-da-cadeia"] });
	});

	it("PUT sem data nem topicos dá 400", async () => {
		const res = await put({});
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, "Informe o nome, a data ou os tópicos da prova.");
	});

	it("prova desconhecida dá 404 'Prova não encontrada.'", async () => {
		const res = await put({ data: "2026-09-04" }, "zzz");
		assert.equal(res.status, 404);
		assert.equal((await res.json()).error, "Prova não encontrada.");
	});

	it("data inválida dá 400 com a mensagem do core", async () => {
		const res = await put({ data: "04/09/2026" });
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, "Informe a data no formato AAAA-MM-DD.");
	});

	it("tópico desconhecido no conteúdo dá 400", async () => {
		const res = await put({ topicos: ["nao-existe"] });
		assert.equal(res.status, 400);
	});

	it("tópico arquivado no conteúdo é descartado sem erro (revisão final, I5)", async () => {
		const m = bibliotecaStore.readMateria("ICE0001")!;
		bibliotecaStore.writeMateria({ ...m, topicos: m.topicos.map((t) => (t.id === "limites" ? { ...t, arquivado: true } : t)) });
		const res = await put({ topicos: ["limites", "derivadas"] });
		assert.equal(res.status, 200);
		assert.ok(!provaNoDisco()!.escopo.topicos.includes("limites"));
		assert.ok(provaNoDisco()!.escopo.topicos.includes("derivadas"));
	});

	it("preparação de prova do SIGAA sem data pede a data (revisão final, I4)", () => {
		svc.adicionarProva("ICE0001", TURMA, { nome: "Prova extra" });
		const v = server.preparacaoView({ materia: "ICE0001", turma: TURMA, avaliacao: "prova-extra" }, new Date(2026, 8, 1));
		assert.deepEqual(v.avisos, ["Defina a data desta prova para saber o que cai."]);
	});

	it("preparação de prova do SIGAA sem tópicos antes dela explica o que fazer (revisão final, I4)", () => {
		svc.adicionarProva("ICE0001", TURMA, { nome: "Prova cedo", data: "2026-08-30" });
		const v = server.preparacaoView({ materia: "ICE0001", turma: TURMA, avaliacao: "prova-cedo" }, new Date(2026, 7, 1));
		assert.deepEqual(v.avisos, ["Ainda não há tópicos de aula antes desta prova. Marque o conteúdo em “Conteúdo da prova”, na página da matéria."]);
	});

	it("PUT nome renomeia a prova à mão; DELETE apaga; a do SIGAA não (revisão final, #14)", async () => {
		svc.adicionarProva("ICE0001", TURMA, { nome: "Prova extra", data: "2026-09-20" });
		assert.equal((await put({ nome: "Prova extra (oral)" }, "prova-extra")).status, 200);
		assert.equal(provaNoDisco("prova-extra")!.nome, "Prova extra (oral)");
		const apagar = (id: string) => server.provaDeleteRoute("ICE0001", TURMA, id, svc);
		assert.equal(apagar("prova-extra").status, 200);
		assert.equal(provaNoDisco("prova-extra"), undefined);
		const r = apagar("sigaa-999");
		assert.equal(r.status, 400);
		assert.equal((await r.json()).error, "Esta prova vem do SIGAA e não pode ser apagada aqui.");
	});

	it("POST cria a prova com o id do nome", async () => {
		const res = await post({ nome: "3ª prova", data: "2026-09-20" });
		assert.equal(res.status, 200);
		const p = provaNoDisco("3a-prova")!;
		assert.equal(p.nome, "3ª prova");
		assert.equal(p.origemData, "manual");
	});
});
