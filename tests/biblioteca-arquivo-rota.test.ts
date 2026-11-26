/** A rota que serve um arquivo da turma dentro do app e o envio de um arquivo
 * extra já ligado a um tópico, sem IA (spec chat+SIGAA §5.5). LH_DATA_DIR isolado. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-biblioteca-arquivo-"));
process.env.LH_DATA_DIR = TMP_DATA;

const server = await import("../src/server/index.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { materiaValida, turmaValida } = await import("./helpers/biblioteca-fixtures.ts");

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const TURMA = "2026-2-prof-exemplo";
bibliotecaStore.writeMateria(materiaValida());
bibliotecaStore.writeTurma("ICE0001", { ...turmaValida(), aulas: [{ ordem: 1, rotulo: "1", data: "2026-09-01", conteudo: "Limites", topicos: ["limites"] }] });
const pdf = bibliotecaStore.addReferenciaFile("ICE0001", TURMA, "aula.pdf", new TextEncoder().encode("%PDF-1.4 teste"));
const docx = bibliotecaStore.addReferenciaFile("ICE0001", TURMA, "ficha.docx", new TextEncoder().encode("PK ficha"));
const md = bibliotecaStore.addReferenciaFile("ICE0001", TURMA, "Exemplos.ipynb.md", new TextEncoder().encode("# Exemplos\n"));
const nb = bibliotecaStore.addReferenciaFile("ICE0001", TURMA, "Caderno.ipynb", new TextEncoder().encode("{}"));

const svc = server.createBibliotecaService({ biblioteca: bibliotecaStore, topicosEmSessoes: () => [] });
const rota = (nome: string) => server.arquivoGetRoute("ICE0001", TURMA, nome, svc);

describe("rota do arquivo", () => {
	it("serve PDF inline com o tipo certo", async () => {
		const res = await rota(pdf.arquivo);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("content-type"), "application/pdf");
		assert.match(res.headers.get("content-disposition") ?? "", /^inline/);
		assert.equal(res.headers.get("x-content-type-options"), "nosniff");
		assert.equal(new TextDecoder().decode(await res.arrayBuffer()), "%PDF-1.4 teste");
	});

	it("texto, markdown e caderno saem como text/plain inline (a mesma tabela da tela)", async () => {
		for (const nome of [md.arquivo, nb.arquivo]) {
			const res = await rota(nome);
			assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8", nome);
			assert.match(res.headers.get("content-disposition") ?? "", /^inline/, nome);
		}
	});

	it(".docx vai como anexo", async () => {
		const res = await rota(docx.arquivo);
		assert.equal(res.headers.get("content-type"), "application/octet-stream");
		assert.match(res.headers.get("content-disposition") ?? "", /^attachment/);
	});

	it("nome com barra ou .. dá 400; inexistente 404", async () => {
		assert.equal((await rota("../conta.json")).status, 400);
		assert.equal((await rota("sub/aula.pdf")).status, 400);
		assert.equal((await rota("nao-existe.pdf")).status, 404);
		assert.equal((await server.arquivoGetRoute("ICE0001", "turma-que-nao-existe", "aula.pdf", svc)).status, 404);
	});
});

describe("envio de arquivo extra com tópico", () => {
	it("adicionarArquivo com tópico grava a referência ligada, sem chamar a IA", () => {
		const r = svc.adicionarArquivo("ICE0001", TURMA, "lista.txt", new TextEncoder().encode("1) Calcule o limite."), "limites");
		assert.equal(r.arquivo, "lista.txt");
		const ref = bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.find((a) => a.arquivo === "lista.txt")!;
		assert.deepEqual(ref.topicos, ["limites"]);
		assert.equal(ref.titulo, "lista.txt");
		assert.equal(ref.aula, 1);
	});

	it("tópico desconhecido ou arquivado dá erro; extensão não aceita também", () => {
		assert.throws(() => svc.adicionarArquivo("ICE0001", TURMA, "x.txt", new Uint8Array([1]), "nao-existe"), /Tópico desconhecido\./);
		assert.throws(() => svc.adicionarArquivo("ICE0001", TURMA, "x.txt", new Uint8Array([1]), "antigo"), /Tópico desconhecido\./);
		assert.throws(() => svc.adicionarArquivo("ICE0001", TURMA, "x.exe", new Uint8Array([1]), "limites"), /Tipo de arquivo não aceito/);
	});

	it("num envio com vários arquivos, um recusado impede todos: nada fica gravado pela metade", async () => {
		const form = new FormData();
		form.append("arquivos", new File(["ok"], "primeiro.md", { type: "text/markdown" }));
		form.append("arquivos", new File(["x"], "segundo.exe", { type: "application/octet-stream" }));
		form.append("topico", "limites");
		const res = await server.materiaisPostRoute(new Request("http://localhost/x", { method: "POST", body: form }), "ICE0001", TURMA, svc);
		assert.equal(res.status, 400);
		assert.equal(bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.some((a) => a.arquivo === "primeiro.md"), false);
	});

	it("o POST multipart com `topico` usa o caminho sem IA", async () => {
		const form = new FormData();
		form.append("arquivos", new File(["# notas"], "notas.md", { type: "text/markdown" }));
		form.append("topico", "limites");
		const res = await server.materiaisPostRoute(new Request("http://localhost/x", { method: "POST", body: form }), "ICE0001", TURMA, svc);
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.deepEqual(body.adicionados.map((a: { arquivo: string }) => a.arquivo), ["notas.md"]);
		assert.deepEqual(body.sugestoes, []);
		assert.deepEqual(bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.find((a) => a.arquivo === "notas.md")!.topicos, ["limites"]);
	});
});
