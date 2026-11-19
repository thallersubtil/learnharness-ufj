/** Spec Etapa A §7.4: os agentes leem os materiais da biblioteca mesmo com o
 * acesso a arquivos restrito em Settings (revisão final, item 5). */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-ufj-file-access-")));
const home = path.join(TMP, "home");
const data = path.join(TMP, "data");
fs.mkdirSync(path.join(home, "Study"), { recursive: true });
fs.mkdirSync(data, { recursive: true });
Object.assign(process.env, { HOME: home, USERPROFILE: home, LH_DATA_DIR: data, LH_AUTH_FILE: path.join(TMP, "auth.json") });

const { SETTINGS_FILE, BIBLIOTECA_DIR } = await import("../config.ts");
const { fileAccessPolicy } = await import("../src/server/file-access.ts");
const { guardSourcePath, resolvePolicy } = await import("../src/agent/tools/file-access.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe("acesso restrito e a biblioteca", () => {
	it("com acesso restrito, os materiais da biblioteca continuam legíveis", () => {
		fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ version: 1, agent: { fileAccess: { restricted: true, folders: ["~/Study"] } } }));
		const slide = path.join(BIBLIOTECA_DIR, "materias/ICE0001/turmas/2026-2-prof-exemplo/referencias/aula.pdf");
		fs.mkdirSync(path.dirname(slide), { recursive: true });
		fs.writeFileSync(slide, "%PDF-");
		const policy = resolvePolicy(fileAccessPolicy());
		assert.equal(policy.restricted, true);
		assert.equal(guardSourcePath(slide, policy), fs.realpathSync(slide));
		assert.throws(() => guardSourcePath(path.join(data, "chats/x.json"), policy), /Access denied/, "só a biblioteca, não a pasta de dados inteira");
	});

	it("sem biblioteca no disco, nada é acrescentado (sem aviso de pasta indisponível)", () => {
		fs.rmSync(BIBLIOTECA_DIR, { recursive: true, force: true });
		const policy = resolvePolicy(fileAccessPolicy());
		assert.deepEqual(policy.unavailable, []);
	});

	it("sem restrição, nada muda", () => {
		fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ version: 1, agent: { fileAccess: { restricted: false, folders: [] } } }));
		assert.deepEqual(fileAccessPolicy(), { restricted: false, folders: [] });
	});
});
