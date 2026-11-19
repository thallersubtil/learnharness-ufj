/** Materiais da turma com sugestão de tópicos (spec Etapa A §7.4). Copiar o
 * arquivo não precisa de revisão; o MAPEAMENTO só é gravado no PUT, depois da
 * revisão do dono. Modelo falso; dados fictícios. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import { tinyPdf } from "./helpers/tiny-pdf.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-biblioteca-materiais-"));
process.env.LH_DATA_DIR = TMP_DATA;

const server = await import("../src/server/index.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { estudoStore } = await import("../src/store/estudo.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const TURMA = "2026-2-prof-exemplo";
const REF_DIR = path.join(TMP_DATA, "biblioteca/materias/ICE0001/turmas", TURMA, "referencias");

bibliotecaStore.writeMateria({ ...materiaValida(), topicos: [{ id: "pilha-vetor", titulo: "Pilha com vetor" }, { id: "fila-circular", titulo: "Fila circular" }] });
bibliotecaStore.writeTurma("ICE0001", { ...turmaValida(), aulas: [{ ordem: 1, rotulo: "1", conteudo: "Pilha com vetor", topicos: ["pilha-vetor"] }], avaliacoes: [] });

let chamadas = 0;
const vistos: string[] = [];
function engine(respostas: unknown[]): PiEngine {
	const faux = createFauxCore({});
	const steps: FauxResponseStep[] = respostas.map((input, i) => (context) => {
		chamadas++;
		vistos.push(JSON.stringify(context.messages));
		return fauxAssistantMessage([fauxToolCall("sugerir_topicos", input as ToolCall["arguments"], { id: `sug-${i}` })], { stopReason: "toolUse" });
	});
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

function svcCom(respostas: unknown[]) {
	const ia = server.createBibliotecaIa({ engineFor: async () => engine(respostas), estudo: estudoStore, biblioteca: bibliotecaStore });
	return server.createBibliotecaService({ biblioteca: bibliotecaStore, topicosEmSessoes: () => [], ia });
}

const PILHA = tinyPdf([{ runs: [{ text: "Pilha com vetor: empilhar e desempilhar", x: 50, y: 700 }] }]);

function envio(files: File[]): Request {
	const form = new FormData();
	for (const f of files) form.append("arquivos", f);
	return new Request("http://localhost/x", { method: "POST", body: form });
}

const put = (body: unknown) => new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) });

describe("materiais da turma", () => {
	it("copia os arquivos, sugere tópicos e não grava o mapeamento", async () => {
		const svc = svcCom([{ sugestoes: [{ arquivo: "4_-_pilha.pdf", topicos: ["pilha-vetor"] }, { arquivo: "lista.md", topicos: [] }] }]);
		const res = await server.materiaisPostRoute(envio([new File([PILHA], "4_-_pilha.pdf"), new File(["# Lista 1\nExercícios de fila"], "lista.md")]), "ICE0001", TURMA, svc);
		assert.equal(res.status, 200);
		const r = await res.json();
		assert.deepEqual(r.adicionados, [{ arquivo: "4_-_pilha.pdf", reutilizado: false }, { arquivo: "lista.md", reutilizado: false }]);
		assert.deepEqual(r.sugestoes, [{ arquivo: "4_-_pilha.pdf", topicos: ["pilha-vetor"] }, { arquivo: "lista.md", topicos: [] }]);
		assert.deepEqual(fs.readdirSync(REF_DIR).sort(), ["4_-_pilha.pdf", "lista.md"]);
		assert.equal(fs.existsSync(path.join(REF_DIR, "..", "referencias.json")), false);
		assert.match(vistos[0]!, /Pilha com vetor: empilhar/, "o trecho do PDF vai para o modelo");
		assert.match(vistos[0]!, /- pilha-vetor: Pilha com vetor/);
	});

	it("o PUT grava referencias.json com o sha256 do arquivo guardado", async () => {
		const svc = svcCom([]);
		const res = await server.materiaisPutRoute(put({ arquivos: [{ arquivo: "4_-_pilha.pdf", topicos: ["pilha-vetor"] }] }), "ICE0001", TURMA, svc);
		assert.equal(res.status, 200);
		const sha = createHash("sha256").update(fs.readFileSync(path.join(REF_DIR, "4_-_pilha.pdf"))).digest("hex");
		assert.deepEqual(bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos, [{ arquivo: "4_-_pilha.pdf", topicos: ["pilha-vetor"], sha256: sha }]);
	});

	it("o PUT com tópico desconhecido ou arquivo inexistente dá 400", async () => {
		const svc = svcCom([]);
		assert.equal((await server.materiaisPutRoute(put({ arquivos: [{ arquivo: "4_-_pilha.pdf", topicos: ["nao-existe"] }] }), "ICE0001", TURMA, svc)).status, 400);
		assert.equal((await server.materiaisPutRoute(put({ arquivos: [{ arquivo: "sumiu.pdf", topicos: [] }] }), "ICE0001", TURMA, svc)).status, 400);
	});

	it("arquivo .exe dá 400 e nada é copiado", async () => {
		const svc = svcCom([]);
		const antes = fs.readdirSync(REF_DIR).length;
		const res = await server.materiaisPostRoute(envio([new File(["x"], "ok.md"), new File(["MZ"], "virus.exe")]), "ICE0001", TURMA, svc);
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, "Tipo de arquivo não aceito: virus.exe");
		assert.equal(fs.readdirSync(REF_DIR).length, antes);
	});

	it("reenviar o mesmo PDF reaproveita o arquivo e não chama o modelo", async () => {
		chamadas = 0;
		const svc = svcCom([]);
		const res = await server.materiaisPostRoute(envio([new File([PILHA], "copia.pdf")]), "ICE0001", TURMA, svc);
		assert.equal(res.status, 200);
		const r = await res.json();
		assert.deepEqual(r.adicionados, [{ arquivo: "4_-_pilha.pdf", reutilizado: true }]);
		assert.deepEqual(r.sugestoes, []);
		assert.equal(chamadas, 0);
	});

	it("a turma lista todos os arquivos guardados, mapeados ou não", async () => {
		const svc = svcCom([]);
		const t = await (await server.turmaGetRoute("ICE0001", TURMA, svc)).json();
		assert.deepEqual(t.arquivos, ["4_-_pilha.pdf", "lista.md"]);
	});

	it("turma inexistente dá 404", async () => {
		const svc = svcCom([]);
		assert.equal((await server.materiaisPostRoute(envio([new File(["x"], "a.md")]), "ICE0001", "2020-1-ninguem", svc)).status, 404);
	});
});
