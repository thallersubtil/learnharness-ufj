/**
 * CONTA UFJ E ESTADO DA SINCRONIZAÇÃO (spec SIGAA §7.2–7.3), sob
 * config.SIGAA_DIR. A senha só chega aqui cifrada. Arquivos 0600.
 */

import fs from "node:fs";
import path from "node:path";
import { SIGAA_DIR } from "../../config.ts";
import type { ContaSigaa, EstadoSigaa, SigaaStore, SituacaoSigaa } from "../core/ports.ts";
import { writeFileAtomicSync } from "./atomic-write.ts";

const CONTA = () => path.join(SIGAA_DIR, "conta.json");
const ESTADO = () => path.join(SIGAA_DIR, "estado.json");
const SITUACOES: readonly SituacaoSigaa[] = ["sem-conta", "ocioso", "sincronizando", "senha-recusada", "erro"];

function ler(file: string): unknown {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}

function gravar(file: string, valor: unknown): void {
	fs.mkdirSync(SIGAA_DIR, { recursive: true, mode: 0o700 });
	writeFileAtomicSync(file, `${JSON.stringify(valor, null, "\t")}\n`, { mode: 0o600 });
}

const texto = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export const sigaaStore: SigaaStore = {
	readConta(): ContaSigaa | null {
		const r = ler(CONTA()) as Record<string, unknown> | null;
		const usuario = texto(r?.usuario);
		const senhaCifrada = texto(r?.senhaCifrada);
		return usuario && senhaCifrada ? { usuario, senhaCifrada } : null;
	},
	writeConta(c: ContaSigaa): void {
		gravar(CONTA(), { usuario: c.usuario, senhaCifrada: c.senhaCifrada });
	},
	apagarConta(): void {
		fs.rmSync(CONTA(), { force: true });
	},
	readEstado(): EstadoSigaa {
		const r = ler(ESTADO()) as Record<string, unknown> | null;
		const situacao = texto(r?.situacao) as SituacaoSigaa | undefined;
		if (!r || !situacao || !SITUACOES.includes(situacao)) return { situacao: "sem-conta", avisos: [] };
		const e: EstadoSigaa = { situacao, avisos: Array.isArray(r.avisos) ? r.avisos.filter((x): x is string => typeof x === "string") : [] };
		for (const k of ["usuario", "ultimaTentativa", "ultimoSucesso", "erro"] as const) {
			const v = texto(r[k]);
			if (v !== undefined) e[k] = v;
		}
		return e;
	},
	writeEstado(e: EstadoSigaa): void {
		gravar(ESTADO(), e);
	},
};
