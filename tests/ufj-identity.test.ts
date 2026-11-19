/** Identidade própria do app (spec Etapa A §7.14): o fork não pode herdar o
 * appId, a pasta de dados nem o canal de atualização do projeto original. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("identidade LearnHarness UFJ", () => {
	it("electron-builder usa a identidade UFJ", () => {
		const yml = read("electron-builder.yml");
		assert.match(yml, /^appId: br\.ufj\.learnharness-ufj$/m);
		assert.match(yml, /^productName: LearnHarness UFJ$/m);
		assert.match(yml, /owner: thallersubtil/);
		assert.match(yml, /repo: learnharness-ufj/);
		assert.doesNotMatch(yml, /amosblomqvist/);
	});

	it("main.cjs nomeia a pasta de dados LearnHarness UFJ", () => {
		assert.match(read("electron/main.cjs"), /PRODUCT_NAME = "LearnHarness UFJ"/);
	});

	it("atualizações estão desligadas", () => {
		assert.equal(require("../electron/updates-policy.cjs").updatesEnabled(), false);
	});

	it("layout declara pt-BR e o título LearnHarness UFJ", () => {
		const layout = read("app/layout.tsx");
		assert.match(layout, /lang="pt-BR"/);
		assert.match(layout, /title: "LearnHarness UFJ"/);
	});

	it("existe um build local sem assinatura para o Mac", () => {
		const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
		assert.match(scripts["desktop:local"] ?? "", /CSC_IDENTITY_AUTO_DISCOVERY=false/);
		assert.match(scripts["desktop:local"] ?? "", /notarize=false/);
		assert.match(scripts["desktop:local"] ?? "", /--publish never/);
		assert.doesNotMatch(scripts["desktop:local"] ?? "", /APPLE_TEAM_ID|LH_NOTARY/);
	});
});
