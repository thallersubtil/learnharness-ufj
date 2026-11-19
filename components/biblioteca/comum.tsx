"use client";

/**
 * Peças comuns das telas da biblioteca UFJ: a moldura de página (TopBar +
 * corpo rolável), os textos de contagem regressiva e a leitura de JSON das
 * rotas com a mensagem de erro em português.
 */

import type { ReactNode } from "react";
import { TopBar } from "@/components/top-bar";

/** "faltam 20 dias" / "falta 1 dia" / "é hoje" / "já passou"; null → "". */
export function textoDias(dias: number | null): string {
	if (dias === null) return "";
	if (dias === 0) return "é hoje";
	if (dias < 0) return "já passou";
	return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

export function BibliotecaPagina({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex h-dvh min-w-0 flex-col">
			<TopBar>
				<h1 className="min-w-0 truncate font-title text-3xl tracking-tight">{titulo}</h1>
				<div className="min-w-4 flex-1" aria-hidden="true" />
				{acoes}
			</TopBar>
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
				<div className="mx-auto w-full max-w-4xl px-5 py-6">{children}</div>
			</div>
		</div>
	);
}

export function Aviso({ children, tom = "aviso" }: { children: ReactNode; tom?: "aviso" | "erro" }) {
	return (
		<p role={tom === "erro" ? "alert" : "status"} className={tom === "erro" ? "rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive" : "rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"}>
			{children}
		</p>
	);
}

export function Secao({ titulo, children, acoes }: { titulo: string; children: ReactNode; acoes?: ReactNode }) {
	return (
		<section className="mt-8 first:mt-0">
			<div className="mb-3 flex items-center gap-2">
				<h2 className="text-xs uppercase tracking-widest text-muted-foreground">{titulo}</h2>
				<div className="flex-1" />
				{acoes}
			</div>
			{children}
		</section>
	);
}

/** Lê a resposta de uma rota da biblioteca; erro vira Error com a mensagem da rota. */
export async function lerResposta<T>(res: Response): Promise<T> {
	const body = (await res.json().catch(() => ({}))) as { error?: unknown };
	if (!res.ok) throw Object.assign(new Error(typeof body.error === "string" ? body.error : `Erro ${res.status}`), { status: res.status, body });
	return body as T;
}
