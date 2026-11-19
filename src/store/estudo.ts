/**
 * O STORE DO ESTUDO PESSOAL (spec Etapa A §7.1): o que é só do aluno e nunca
 * vai para a biblioteca compartilhada.
 *
 *   estudo/preparacoes.json — horas disponíveis por "<materia>/<turma>/<avaliacao>"
 *   estudo/uso.jsonl        — uso de modelo das chamadas da biblioteca (custo)
 */

import fs from "node:fs";
import path from "node:path";
import { ESTUDO_DIR } from "../../config.ts";
import { writeFileAtomicSync } from "./atomic-write.ts";
import type { EstudoStore } from "../core/ports.ts";

const PREPARACOES = () => path.join(/* turbopackIgnore: true */ ESTUDO_DIR, "preparacoes.json");
const USO = () => path.join(/* turbopackIgnore: true */ ESTUDO_DIR, "uso.jsonl");

interface PreparacoesFile {
	formato: 1;
	horas: Record<string, number>;
}

function readPreparacoes(): PreparacoesFile {
	try {
		const raw = JSON.parse(fs.readFileSync(PREPARACOES(), "utf-8")) as Partial<PreparacoesFile>;
		if (raw?.formato === 1 && raw.horas && typeof raw.horas === "object") {
			const horas: Record<string, number> = {};
			for (const [k, v] of Object.entries(raw.horas)) if (typeof v === "number" && Number.isFinite(v) && v > 0) horas[k] = v;
			return { formato: 1, horas };
		}
	} catch {
		/* ausente ou ilegível: começa vazio */
	}
	return { formato: 1, horas: {} };
}

export const estudoStore: EstudoStore = {
	readHoras(chave) {
		return readPreparacoes().horas[chave] ?? null;
	},

	writeHoras(chave, horas) {
		const file = readPreparacoes();
		if (horas === null) delete file.horas[chave];
		else file.horas[chave] = horas;
		fs.mkdirSync(ESTUDO_DIR, { recursive: true });
		writeFileAtomicSync(PREPARACOES(), `${JSON.stringify(file, null, "\t")}\n`);
	},

	appendUso(entrada) {
		fs.mkdirSync(ESTUDO_DIR, { recursive: true });
		fs.appendFileSync(USO(), `${JSON.stringify(entrada)}\n`, "utf-8");
	},
};
