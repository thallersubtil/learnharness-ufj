/** Rascunho do plano de ensino a partir do PDF (spec Etapa A §7.3, passos 1–3).
 * Modelo falso (faux) e PDFs feitos à mão; dados fictícios. Nada é gravado na
 * biblioteca: o rascunho só volta para revisão. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import { tinyPdf } from "./helpers/tiny-pdf.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-biblioteca-rascunho-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { createBibliotecaIa, rascunhoRoute } = await import("../src/server/index.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { estudoStore } = await import("../src/store/estudo.ts");
const { ModelsNotConfiguredError } = await import("../src/core/settings.ts");
const { ROLE_SLOT } = await import("../src/core/settings.ts");
const { materiaValida } = await import("./helpers/biblioteca-fixtures.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const PLANO_PDF = tinyPdf([
	{ runs: [{ text: "PLANO DE ENSINO Disciplina: Disciplina Teste Codigo: ICE0001", x: 50, y: 700 }, { text: "Docente: Prof. Exemplo", x: 50, y: 680 }] },
	{ runs: [{ text: "CRONOGRAMA 1 e 2 Limites 3 e 4 Avaliacao N1", x: 50, y: 700 }] },
]);

/** A resposta fictícia do modelo para "Disciplina Teste ICE0001, Prof. Exemplo, N1/N2". */
function planoFicticio(over: Record<string, unknown> = {}) {
	return {
		materia: {
			codigo: "ICE0001", nome: "Disciplina Teste", curso: "Bacharelado Teste", unidade: "Instituto Teste",
			ementa: "Limites. Derivadas.", objetivos: { geral: ["Compreender."], especificos: [] },
			bibliografia: { basica: ["AUTOR. Livro."], complementar: [], virtual: [] },
		},
		turma: { semestre: "2026-2", docente: "Prof. Exemplo", turno: "Noturno", criteriosMedia: "M=(N1+N2)/2" },
		topicos: [
			{ ref: "a", titulo: "Limites", existente: false },
			{ ref: "b", titulo: "Derivadas", existente: false },
		],
		aulas: [
			{ rotulo: "1 e 2", data: "2026-08-19", conteudo: "Limites", topicos: ["a"] },
			{ rotulo: "3 e 4", data: "2026-08-25", conteudo: "Avaliação", avaliacaoId: "N1", topicos: [] },
			{ rotulo: "5 e 6", data: "2026-09-01", conteudo: "Derivadas", topicos: ["b"] },
			{ rotulo: "7 e 8", data: "2026-09-08", conteudo: "Avaliação", avaliacaoId: "N2", topicos: [] },
		],
		avaliacoes: [
			{ id: "N1", nome: "N1 — Avaliação escrita", tipo: "prova-escrita", data: "2026-08-25", pontos: 10 },
			{ id: "N2", nome: "N2 — Avaliação escrita", tipo: "prova-escrita", data: "2026-09-08", pontos: 10 },
		],
		...over,
	};
}

/** Engine falso que responde em ordem e guarda o texto que o modelo recebeu. */
function fauxEngine(respostas: unknown[], vistos: string[] = []): PiEngine {
	const faux = createFauxCore({});
	const steps: FauxResponseStep[] = respostas.map((input, i) => (context) => {
		vistos.push(JSON.stringify(context.messages));
		return fauxAssistantMessage([fauxToolCall("enviar_plano", input as ToolCall["arguments"], { id: `plano-${i}` })], { stopReason: "toolUse" });
	});
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

function ia(engineFor: () => Promise<PiEngine>) {
	return createBibliotecaIa({ engineFor, estudo: estudoStore, biblioteca: bibliotecaStore, now: () => new Date("2026-11-19T12:00:00.000Z") });
}

function requestCom(file: File): Request {
	const form = new FormData();
	form.append("plano", file);
	return new Request("http://localhost/api/biblioteca/plano/rascunho", { method: "POST", body: form });
}

const pdfFile = (bytes: Uint8Array<ArrayBuffer>, name = "plano.pdf") => new File([bytes], name, { type: "application/pdf" });

describe("papel do modelo da biblioteca", () => {
	it("a biblioteca usa o slot Strong", () => {
		assert.equal(ROLE_SLOT.biblioteca, "strong");
	});
});

describe("rascunho do plano", () => {
	it("monta o rascunho sem gravar nada na biblioteca", async () => {
		const res = await rascunhoRoute(requestCom(pdfFile(PLANO_PDF)), ia(async () => fauxEngine([planoFicticio()])));
		assert.equal(res.status, 200);
		const r = await res.json();
		assert.equal(r.turma.id, "2026-2-prof-exemplo");
		assert.equal(r.turma.docente.slug, "prof-exemplo");
		assert.deepEqual(r.turma.aulas.map((a: { ordem: number }) => a.ordem), [1, 2, 3, 4]);
		assert.equal(r.turma.avaliacoes[0].posicao, 1);
		assert.deepEqual(r.turma.avaliacoes[1].escopo.topicos, ["derivadas"]);
		assert.deepEqual(r.materia.topicos.map((t: { id: string }) => t.id), ["limites", "derivadas"]);
		assert.ok(r.custoUsd === null || typeof r.custoUsd === "number");
		assert.deepEqual(r.existente, { materia: false, turma: false });
		assert.equal(r.turma.importadoEm, "2026-11-19T12:00:00.000Z");
		assert.equal(fs.existsSync(path.join(TMP_DATA, "biblioteca")), false, "nada gravado antes da revisão");
		const uso = fs.readFileSync(path.join(TMP_DATA, "estudo/uso.jsonl"), "utf8").trim().split("\n");
		assert.equal(uso.length, 1);
		assert.equal(JSON.parse(uso[0]!).operacao, "rascunho-plano");
	});

	it("PDF sem texto selecionável dá 400", async () => {
		const res = await rascunhoRoute(requestCom(pdfFile(tinyPdf([{}, {}]))), ia(async () => fauxEngine([])));
		assert.equal(res.status, 400);
		assert.match((await res.json()).error, /não tem texto selecionável/);
	});

	it("arquivo que não é PDF dá 400", async () => {
		const res = await rascunhoRoute(requestCom(new File(["oi"], "plano.txt")), ia(async () => fauxEngine([])));
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, "O arquivo não é um PDF.");
	});

	it("pedido sem arquivo dá 400", async () => {
		const res = await rascunhoRoute(new Request("http://localhost/x", { method: "POST", body: new FormData() }), ia(async () => fauxEngine([])));
		assert.equal(res.status, 400);
	});

	it("sem modelo configurado dá 503 models_not_configured", async () => {
		const res = await rascunhoRoute(requestCom(pdfFile(PLANO_PDF)), ia(async () => { throw new ModelsNotConfiguredError(["strong"]); }));
		assert.equal(res.status, 503);
		const body = await res.json();
		assert.equal(body.code, "models_not_configured");
		assert.equal(body.error, "Nenhum modelo configurado. Escolha seus modelos em Settings → Providers.");
	});

	it("aula citando ref inexistente volta como erro para o modelo, e a correção é aceita", async () => {
		const ruim = planoFicticio({ aulas: [{ rotulo: "1", conteudo: "Limites", topicos: ["zzz"] }] });
		const vistos: string[] = [];
		const res = await rascunhoRoute(requestCom(pdfFile(PLANO_PDF)), ia(async () => fauxEngine([ruim, planoFicticio()], vistos)));
		assert.equal(res.status, 200);
		assert.equal(vistos.length, 2, "o modelo foi chamado de novo depois do erro");
		assert.match(vistos[1]!, /zzz/);
	});

	it("o prompt lista os tópicos existentes da matéria", async () => {
		bibliotecaStore.writeMateria(materiaValida());
		const vistos: string[] = [];
		const comExistente = planoFicticio({ topicos: [{ ref: "limites", titulo: "Limites", existente: true }, { ref: "b", titulo: "Derivadas", existente: false }],
			aulas: [{ rotulo: "1", conteudo: "Limites", topicos: ["limites"] }, { rotulo: "2", conteudo: "Derivadas", topicos: ["b"] }] });
		const res = await rascunhoRoute(requestCom(pdfFile(PLANO_PDF)), ia(async () => fauxEngine([comExistente], vistos)));
		assert.equal(res.status, 200);
		assert.match(vistos[0]!, /- limites: Limites/);
		const r = await res.json();
		assert.equal(r.existente.materia, true);
		// "derivadas" já existe na matéria, então o tópico novo ganha sufixo
		assert.ok(r.materia.topicos.some((t: { id: string }) => t.id === "derivadas-2"));
		assert.deepEqual(r.turma.aulas[0].topicos, ["limites"]);
	});
});

describe("reaproveitar tópicos ao reimportar (revisão final, item 2)", () => {
	it("acha a matéria pelo código em qualquer lugar do texto, sem depender de 'Código:'", async () => {
		bibliotecaStore.writeMateria(materiaValida());
		const pdf = tinyPdf([{ runs: [{ text: "PLANO DE ENSINO - Disciplina Teste (ICE0001) - Prof. Exemplo", x: 50, y: 700 }] }]);
		const vistos: string[] = [];
		const comExistente = planoFicticio({ topicos: [{ ref: "limites", titulo: "Limites", existente: true }], aulas: [{ rotulo: "1", conteudo: "Limites", topicos: ["limites"] }] });
		const res = await rascunhoRoute(requestCom(pdfFile(pdf)), ia(async () => fauxEngine([comExistente], vistos)));
		assert.equal(res.status, 200);
		assert.match(vistos[0]!, /- limites: Limites/);
		assert.ok(!(await res.json()).avisos.some((a: string) => /não foram mostrados ao modelo/.test(a)));
	});

	it("avisa quando a matéria só foi reconhecida depois da leitura", async () => {
		bibliotecaStore.writeMateria(materiaValida());
		const pdf = tinyPdf([{ runs: [{ text: "PLANO DE ENSINO sem codigo legivel", x: 50, y: 700 }] }]);
		const vistos: string[] = [];
		const res = await rascunhoRoute(requestCom(pdfFile(pdf)), ia(async () => fauxEngine([planoFicticio()], vistos)));
		assert.equal(res.status, 200);
		assert.match(vistos[0]!, /\(nenhum\)/);
		const r = await res.json();
		assert.equal(r.existente.materia, true);
		assert.ok(r.avisos.some((a: string) => /não foram mostrados ao modelo/.test(a)), JSON.stringify(r.avisos));
	});
});
