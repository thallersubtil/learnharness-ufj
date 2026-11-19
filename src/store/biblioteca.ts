/**
 * O STORE DA BIBLIOTECA UFJ (spec Etapa A §7.2): arquivos JSON e originais sob
 * config.BIBLIOTECA_DIR, atrás da porta BibliotecaStore.
 *
 *   materias/<CODIGO>/materia.json
 *   materias/<CODIGO>/turmas/<turmaId>/{turma.json, plano.pdf, referencias.json}
 *   materias/<CODIGO>/turmas/<turmaId>/referencias/<arquivo>
 *
 * Todo id passa pela gramática de core/biblioteca.ts antes de virar caminho,
 * então um id forjado não sai da pasta. Toda escrita é atômica e emite
 * `biblioteca-changed`. Ler um arquivo de formato mais novo LANÇA (nunca é
 * tratado como ausente), para que nenhuma escrita sobrescreva dado mais novo.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { BIBLIOTECA_DIR } from "../../config.ts";
import { writeFileAtomicSync } from "./atomic-write.ts";
import { emit } from "../core/events.ts";
import type { BibliotecaStore } from "../core/ports.ts";
import {
	BibliotecaEntradaError,
	BibliotecaFormatoError,
	isValidCodigo,
	isValidNomeArquivo,
	isValidSlug,
	parseMateria,
	parseReferencias,
	parseTurma,
	type Materia,
	type Referencias,
	type Turma,
} from "../core/biblioteca.ts";

const MATERIAS = () => path.join(/* turbopackIgnore: true */ BIBLIOTECA_DIR, "materias");

function materiaDir(codigo: string): string {
	if (!isValidCodigo(codigo)) throw new BibliotecaEntradaError(`Código de disciplina inválido: "${codigo}".`);
	return path.join(/* turbopackIgnore: true */ MATERIAS(), codigo);
}

function turmaDir(codigo: string, turmaId: string): string {
	if (!isValidSlug(turmaId)) throw new BibliotecaEntradaError(`Id de turma inválido: "${turmaId}".`);
	return path.join(/* turbopackIgnore: true */ materiaDir(codigo), "turmas", turmaId);
}

function referenciasDir(codigo: string, turmaId: string): string {
	return path.join(/* turbopackIgnore: true */ turmaDir(codigo, turmaId), "referencias");
}

function checkNome(nome: string): string {
	if (!isValidNomeArquivo(nome)) throw new BibliotecaEntradaError(`Nome de arquivo inválido: "${nome}".`);
	return nome;
}

const json = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`;

/** Lê e valida um JSON; ausente → null; corrompido → BibliotecaEntradaError; mais novo → BibliotecaFormatoError. */
function readJson<T>(file: string, parse: (raw: unknown) => T): T | null {
	let text: string;
	try {
		text = fs.readFileSync(file, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new BibliotecaEntradaError(`${path.basename(file)} está corrompido (JSON inválido).`);
	}
	return parse(raw);
}

function writeBytesAtomicSync(file: string, bytes: Uint8Array): void {
	const tmp = `${file}.tmp-${randomUUID()}`;
	try {
		fs.writeFileSync(tmp, bytes, { flag: "wx" });
		fs.renameSync(tmp, file);
	} catch (error) {
		fs.rmSync(tmp, { force: true });
		throw error;
	}
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function describeProblema(nome: string, error: unknown): string {
	if (error instanceof BibliotecaFormatoError) return `${nome}: formato mais novo que este app`;
	if (error instanceof BibliotecaEntradaError) return `${nome}: ${error.message}`;
	return `${nome}: não foi possível ler (${(error as Error)?.message ?? String(error)})`;
}

function nomeLivre(dir: string, nome: string): string {
	if (!fs.existsSync(path.join(/* turbopackIgnore: true */ dir, nome))) return nome;
	const ext = path.extname(nome);
	const base = nome.slice(0, nome.length - ext.length);
	for (let n = 2; ; n++) {
		const candidato = `${base} (${n})${ext}`;
		if (!fs.existsSync(path.join(/* turbopackIgnore: true */ dir, candidato))) return candidato;
	}
}

export const bibliotecaStore: BibliotecaStore = {
	listMaterias() {
		let nomes: string[];
		try {
			nomes = fs.readdirSync(MATERIAS());
		} catch {
			return { materias: [], problemas: [] };
		}
		const materias: Materia[] = [];
		const problemas: string[] = [];
		for (const nome of nomes.sort()) {
			if (nome.startsWith(".")) continue;
			if (!isValidCodigo(nome)) {
				problemas.push(`${nome}: nome de pasta não é um código de disciplina`);
				continue;
			}
			try {
				const m = readJson(path.join(/* turbopackIgnore: true */ MATERIAS(), nome, "materia.json"), parseMateria);
				if (!m) continue;
				if (m.codigo !== nome) {
					problemas.push(`${nome}: o código dentro do arquivo é "${m.codigo}"`);
					continue;
				}
				materias.push(m);
			} catch (error) {
				problemas.push(describeProblema(nome, error));
			}
		}
		return { materias, problemas };
	},

	readMateria(codigo) {
		return readJson(path.join(/* turbopackIgnore: true */ materiaDir(codigo), "materia.json"), parseMateria);
	},

	writeMateria(m) {
		const valida = parseMateria(m);
		const dir = materiaDir(valida.codigo);
		fs.mkdirSync(dir, { recursive: true });
		writeFileAtomicSync(path.join(/* turbopackIgnore: true */ dir, "materia.json"), json(valida));
		emit("biblioteca-changed", {});
	},

	listTurmas(codigo) {
		return this.listTurmasComProblemas(codigo).turmas;
	},

	listTurmasComProblemas(codigo) {
		const dir = path.join(/* turbopackIgnore: true */ materiaDir(codigo), "turmas");
		let nomes: string[];
		try {
			nomes = fs.readdirSync(dir);
		} catch {
			return { turmas: [], problemas: [] };
		}
		const turmas: Turma[] = [];
		const problemas: string[] = [];
		for (const nome of nomes.sort()) {
			if (nome.startsWith(".") || !isValidSlug(nome)) continue;
			try {
				const t = readJson(path.join(/* turbopackIgnore: true */ dir, nome, "turma.json"), parseTurma);
				if (!t) continue;
				if (t.id !== nome) problemas.push(`${codigo}/${nome}: o id dentro do arquivo é "${t.id}"`);
				else turmas.push(t);
			} catch (error) {
				problemas.push(describeProblema(`${codigo}/${nome}`, error));
			}
		}
		return { turmas, problemas };
	},

	readTurma(codigo, turmaId) {
		return readJson(path.join(/* turbopackIgnore: true */ turmaDir(codigo, turmaId), "turma.json"), parseTurma);
	},

	writeTurma(codigo, t, planoPdf) {
		const valida = parseTurma(t);
		const dir = turmaDir(codigo, valida.id);
		fs.mkdirSync(dir, { recursive: true });
		writeFileAtomicSync(path.join(/* turbopackIgnore: true */ dir, "turma.json"), json(valida));
		if (planoPdf) writeBytesAtomicSync(path.join(/* turbopackIgnore: true */ dir, "plano.pdf"), planoPdf);
		emit("biblioteca-changed", {});
	},

	readReferencias(codigo, turmaId) {
		return readJson(path.join(/* turbopackIgnore: true */ turmaDir(codigo, turmaId), "referencias.json"), parseReferencias) ?? { formato: 1, arquivos: [] };
	},

	writeReferencias(codigo, turmaId, r: Referencias) {
		const valida = parseReferencias(r);
		const dir = turmaDir(codigo, turmaId);
		fs.mkdirSync(dir, { recursive: true });
		writeFileAtomicSync(path.join(/* turbopackIgnore: true */ dir, "referencias.json"), json(valida));
		emit("biblioteca-changed", {});
	},

	addReferenciaFile(codigo, turmaId, nome, bytes) {
		checkNome(nome);
		const dir = referenciasDir(codigo, turmaId);
		fs.mkdirSync(dir, { recursive: true });
		const hash = sha256(bytes);
		for (const existente of fs.readdirSync(dir).sort()) {
			if (existente.includes(".tmp-")) continue;
			const file = path.join(/* turbopackIgnore: true */ dir, existente);
			if (fs.statSync(file).size === bytes.byteLength && sha256(fs.readFileSync(file)) === hash) {
				return { arquivo: existente, sha256: hash, reutilizado: true };
			}
		}
		const arquivo = nomeLivre(dir, nome);
		writeBytesAtomicSync(path.join(/* turbopackIgnore: true */ dir, arquivo), bytes);
		emit("biblioteca-changed", {});
		return { arquivo, sha256: hash, reutilizado: false };
	},

	referenciaPath(codigo, turmaId, arquivo) {
		return path.join(/* turbopackIgnore: true */ referenciasDir(codigo, turmaId), checkNome(arquivo));
	},

	listReferenciaFiles(codigo, turmaId) {
		try {
			return fs.readdirSync(referenciasDir(codigo, turmaId)).filter((n) => !n.includes(".tmp-") && isValidNomeArquivo(n)).sort();
		} catch {
			return [];
		}
	},

	referenciaSha256(codigo, turmaId, arquivo) {
		try {
			return sha256(fs.readFileSync(this.referenciaPath(codigo, turmaId, arquivo)));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	},

	planoPdfPath(codigo, turmaId) {
		const file = path.join(/* turbopackIgnore: true */ turmaDir(codigo, turmaId), "plano.pdf");
		return fs.existsSync(file) ? file : null;
	},
};
