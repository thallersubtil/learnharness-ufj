/** Armazenamento da biblioteca e do estudo pessoal (spec Etapa A §7.2). Roda
 * num LH_DATA_DIR isolado: o env vem antes de qualquer import que lê config. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-biblioteca-store-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { estudoStore } = await import("../src/store/estudo.ts");
const { subscribe } = await import("../src/core/events.ts");
const { BibliotecaEntradaError } = await import("../src/core/biblioteca.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const BIB = path.join(TMP_DATA, "biblioteca");

describe("bibliotecaStore", () => {
	it("grava e lê de volta matéria, turma e plano.pdf", () => {
		bibliotecaStore.writeMateria(materiaValida());
		bibliotecaStore.writeTurma("ICE0001", turmaValida(), new Uint8Array([37, 80, 68, 70, 45]));
		assert.equal(bibliotecaStore.readMateria("ICE0001")!.nome, "Disciplina Teste");
		assert.equal(bibliotecaStore.readTurma("ICE0001", "2026-2-prof-exemplo")!.docente.nome, "Prof. Exemplo");
		assert.deepEqual(bibliotecaStore.listTurmas("ICE0001").map((t) => t.id), ["2026-2-prof-exemplo"]);
		const pdf = path.join(BIB, "materias/ICE0001/turmas/2026-2-prof-exemplo/plano.pdf");
		assert.ok(fs.existsSync(pdf));
		assert.equal(bibliotecaStore.planoPdfPath("ICE0001", "2026-2-prof-exemplo"), pdf);
		const raw = fs.readFileSync(path.join(BIB, "materias/ICE0001/materia.json"), "utf8");
		assert.ok(raw.startsWith('{\n\t"formato": 1'), "JSON com tab e formato primeiro");
		assert.ok(raw.endsWith("}\n"));
	});

	it("lista as válidas e reporta corrompidas e de formato mais novo (foco 4)", () => {
		fs.mkdirSync(path.join(BIB, "materias/ICE0002"), { recursive: true });
		fs.writeFileSync(path.join(BIB, "materias/ICE0002/materia.json"), "{ quebrado");
		fs.mkdirSync(path.join(BIB, "materias/ICE0003"), { recursive: true });
		fs.writeFileSync(path.join(BIB, "materias/ICE0003/materia.json"), JSON.stringify({ ...materiaValida(), codigo: "ICE0003", formato: 2 }));
		const { materias, problemas } = bibliotecaStore.listMaterias();
		assert.deepEqual(materias.map((m) => m.codigo), ["ICE0001"]);
		assert.equal(problemas.length, 2);
		assert.match(problemas.join("\n"), /ICE0002/);
		assert.match(problemas.join("\n"), /ICE0003: formato mais novo que este app/);
	});

	it("recusa ids que sairiam da pasta", () => {
		assert.throws(() => bibliotecaStore.readMateria("../x"), BibliotecaEntradaError);
		assert.throws(() => bibliotecaStore.readTurma("ICE0001", "../../x"), BibliotecaEntradaError);
		assert.throws(() => bibliotecaStore.addReferenciaFile("ICE0001", "2026-2-prof-exemplo", "../x.pdf", new Uint8Array([1])), BibliotecaEntradaError);
	});

	it("não duplica a mesma referência e renomeia nome repetido com outro conteúdo", () => {
		const a = bibliotecaStore.addReferenciaFile("ICE0001", "2026-2-prof-exemplo", "aula 1.pdf", new Uint8Array([1, 2, 3]));
		const b = bibliotecaStore.addReferenciaFile("ICE0001", "2026-2-prof-exemplo", "copia.pdf", new Uint8Array([1, 2, 3]));
		const c = bibliotecaStore.addReferenciaFile("ICE0001", "2026-2-prof-exemplo", "aula 1.pdf", new Uint8Array([9]));
		assert.equal(a.reutilizado, false);
		assert.equal(b.reutilizado, true);
		assert.equal(b.arquivo, "aula 1.pdf");
		assert.equal(c.arquivo, "aula 1 (2).pdf");
		assert.match(a.sha256, /^[0-9a-f]{64}$/);
		const dir = path.join(BIB, "materias/ICE0001/turmas/2026-2-prof-exemplo/referencias");
		assert.deepEqual(fs.readdirSync(dir).sort(), ["aula 1 (2).pdf", "aula 1.pdf"]);
		assert.equal(bibliotecaStore.referenciaPath("ICE0001", "2026-2-prof-exemplo", "aula 1.pdf"), path.join(dir, "aula 1.pdf"));
	});

	it("referências: vazio sem arquivo, depois grava e lê", () => {
		assert.deepEqual(bibliotecaStore.readReferencias("ICE0001", "2026-2-prof-exemplo"), { formato: 1, arquivos: [] });
		const r = { formato: 1 as const, arquivos: [{ arquivo: "aula 1.pdf", topicos: ["limites"], sha256: "a".repeat(64) }] };
		bibliotecaStore.writeReferencias("ICE0001", "2026-2-prof-exemplo", r);
		assert.deepEqual(bibliotecaStore.readReferencias("ICE0001", "2026-2-prof-exemplo"), r);
	});

	it("toda escrita emite biblioteca-changed", () => {
		const vistos: string[] = [];
		const off = subscribe((evento) => vistos.push(evento.type));
		bibliotecaStore.writeMateria(materiaValida());
		off();
		assert.ok(vistos.includes("biblioteca-changed"));
	});
});

describe("estudoStore", () => {
	it("horas: grava 6 e lê 6; grava null e lê null", () => {
		estudoStore.writeHoras("ICE0001/2026-2-prof-exemplo/N1", 6);
		assert.equal(estudoStore.readHoras("ICE0001/2026-2-prof-exemplo/N1"), 6);
		estudoStore.writeHoras("ICE0001/2026-2-prof-exemplo/N1", null);
		assert.equal(estudoStore.readHoras("ICE0001/2026-2-prof-exemplo/N1"), null);
		assert.equal(estudoStore.readHoras("nao/existe/X"), null);
	});

	it("appendUso acrescenta uma linha JSON em estudo/uso.jsonl", () => {
		const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
		estudoStore.appendUso({ em: "2026-11-19T00:00:00.000Z", operacao: "rascunho-plano", model: "faux:faux", usage });
		estudoStore.appendUso({ em: "2026-11-19T00:00:01.000Z", operacao: "sugerir-materiais", model: "faux:faux", usage });
		const linhas = fs.readFileSync(path.join(TMP_DATA, "estudo/uso.jsonl"), "utf8").trim().split("\n");
		assert.equal(linhas.length, 2);
		assert.equal(JSON.parse(linhas[1]!).operacao, "sugerir-materiais");
	});
});
