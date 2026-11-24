/** A senha do SIGAA cifrada pelo processo principal do Electron (spec SIGAA
 * §7.2) e a conta guardada na pasta de dados. Electron e chaveiro falsos. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sigaa-segredo-"));
process.env.LH_DATA_DIR = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const require = createRequire(import.meta.url);
const { attachSegredoChild } = require("../electron/segredo-ipc.cjs") as {
	attachSegredoChild: (child: unknown, safeStorage: unknown) => { dispose(): void };
};
const { cifrarSegredo, decifrarSegredo } = await import("../src/server/sigaa/segredo.ts");
const { sigaaStore } = await import("../src/store/sigaa.ts");
const { SIGAA_DIR } = await import("../config.ts");

/** Um processo filho falso: guarda o que o principal manda e entrega mensagens. */
function filhoFalso() {
	const filho = Object.assign(new EventEmitter(), { connected: true, enviados: [] as unknown[] });
	(filho as unknown as { send: (m: unknown, cb?: () => void) => void }).send = (m, cb) => {
		filho.enviados.push(m);
		cb?.();
	};
	return filho;
}
const chaveiro = (disponivel = true) => ({
	isEncryptionAvailable: () => disponivel,
	encryptString: (t: string) => Buffer.from(`cifrado:${t}`),
	decryptString: (b: Buffer) => b.toString().replace(/^cifrado:/, ""),
});
const esperar = () => new Promise((r) => setImmediate(r));

describe("chaveiro pelo processo principal", () => {
	it("o processo principal cifra e decifra pelo canal lh:segredo", async () => {
		const filho = filhoFalso();
		attachSegredoChild(filho, chaveiro());
		filho.emit("message", { channel: "lh:segredo", id: "1", op: "cifrar", texto: "minha senha" });
		await esperar();
		const r1 = filho.enviados[0] as { ok: boolean; value: string; id: string; op: string; channel: string };
		assert.deepEqual({ ...r1 }, { channel: "lh:segredo", id: "1", op: "cifrar", ok: true, value: Buffer.from("cifrado:minha senha").toString("base64") });
		filho.emit("message", { channel: "lh:segredo", id: "2", op: "decifrar", cifrado: r1.value });
		await esperar();
		assert.equal((filho.enviados[1] as { value: string }).value, "minha senha");
	});

	it("sem chaveiro responde ok:false com a mensagem em português", async () => {
		const filho = filhoFalso();
		attachSegredoChild(filho, chaveiro(false));
		filho.emit("message", { channel: "lh:segredo", id: "1", op: "cifrar", texto: "x" });
		await esperar();
		assert.deepEqual(filho.enviados[0], { channel: "lh:segredo", id: "1", op: "cifrar", ok: false, error: "O chaveiro do sistema não está disponível." });
	});

	it("ignora mensagens de outro canal", async () => {
		const filho = filhoFalso();
		const anexo = attachSegredoChild(filho, chaveiro());
		filho.emit("message", { channel: "lh:subscriptions", id: "1", op: "cifrar", texto: "x" });
		await esperar();
		assert.equal(filho.enviados.length, 0);
		anexo.dispose();
		filho.emit("message", { channel: "lh:segredo", id: "2", op: "cifrar", texto: "x" });
		await esperar();
		assert.equal(filho.enviados.length, 0, "depois do dispose, nada");
	});
});

describe("o lado do servidor", () => {
	it("modo dev só fora do app de desktop", async () => {
		const antes = { ...process.env };
		try {
			process.env.LH_SIGAA_SENHA_DEV = "1";
			delete process.env.LH_DESKTOP_SERVER;
			const c = await cifrarSegredo("çã senha");
			assert.match(c, /^dev:/);
			assert.equal(await decifrarSegredo(c), "çã senha");
			process.env.LH_DESKTOP_SERVER = "1";
			await assert.rejects(cifrarSegredo("x"), /Guardar a senha só funciona no app de desktop\./);
		} finally {
			process.env = antes;
		}
	});
});

describe("conta guardada", () => {
	it("conta e estado gravados com permissão 0600", () => {
		sigaaStore.writeConta({ usuario: "aluno.teste", senhaCifrada: "dev:eA==" });
		sigaaStore.writeEstado({ situacao: "ocioso", usuario: "aluno.teste", ultimoSucesso: "2026-11-24T12:00:00.000Z", avisos: ["um aviso"] });
		assert.deepEqual(sigaaStore.readConta(), { usuario: "aluno.teste", senhaCifrada: "dev:eA==" });
		assert.deepEqual(sigaaStore.readEstado(), { situacao: "ocioso", usuario: "aluno.teste", ultimoSucesso: "2026-11-24T12:00:00.000Z", avisos: ["um aviso"] });
		for (const nome of fs.readdirSync(SIGAA_DIR)) assert.equal(fs.statSync(path.join(SIGAA_DIR, nome)).mode & 0o777, 0o600, nome);
		sigaaStore.apagarConta();
		assert.equal(sigaaStore.readConta(), null);
	});

	it("estado sem arquivo é sem-conta", () => {
		fs.rmSync(SIGAA_DIR, { recursive: true, force: true });
		assert.deepEqual(sigaaStore.readEstado(), { situacao: "sem-conta", avisos: [] });
	});
});
