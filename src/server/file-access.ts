/** Current optional learner-source preferences, wired by the server
 * composition root into the #157 policy seam. Mandatory #421 protection
 * stays in fs-shared; do NOT add a whole data/userData denial here. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BIBLIOTECA_DIR } from "../../config.ts";
import type { FileAccessPolicy } from "../agent/tools/file-access.ts";
import { readFileAccessSettings } from "../store/settings.ts";

export function expandFolder(folder: string, home: string = os.homedir()): string {
	if (folder === "~") return home;
	if (folder.startsWith("~/")) return path.join(home, folder.slice(2));
	if (!path.isAbsolute(folder)) throw new Error("Invalid file-access folder for this server filesystem");
	return path.resolve(folder);
}

/**
 * UFJ (spec Etapa A §7.4): com o acesso restrito, a biblioteca entra como
 * pasta permitida — o contexto UFJ manda o agente ler os materiais do
 * professor que estão lá. Só a biblioteca, nunca a pasta de dados inteira, e
 * só quando ela existe (uma pasta ausente viraria aviso para o modelo).
 * Fatia 2: provas/ e simulados/ dentro dela precisam continuar bloqueados.
 */
export function fileAccessPolicy(): FileAccessPolicy {
	const result = readFileAccessSettings();
	if (!result.ok) return { restricted: true, folders: [], error: result.error };
	const folders = result.settings.folders.map((folder) => expandFolder(folder));
	if (result.settings.restricted && fs.existsSync(BIBLIOTECA_DIR)) folders.push(BIBLIOTECA_DIR);
	return { restricted: result.settings.restricted, folders };
}

/** Safe UI diagnostic, no raw JSON/file contents. A corrupt record must
 * not make the restriction toggle appear safely OFF while reads are blocked. */
export function fileAccessConfigurationError(): string | null {
	const result = readFileAccessSettings();
	return result.ok ? null : result.error;
}
