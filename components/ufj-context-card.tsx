"use client";

import { GraduationCapIcon } from "lucide-react";
import { formatarDataCurta, type UfjContextPayload } from "@/src/core";

/**
 * O cartão do contexto UFJ (spec Etapa A §7.6): message[0] de uma sessão
 * criada pela biblioteca. Uma linha discreta, como o cartão do grafo. Usa só
 * o payload do marcador — a sessão abre mesmo se a biblioteca mudar depois.
 * O modelo lê o texto completo do marcador; isto é o rosto dele para o aluno.
 */
export function UfjContextCard({ data }: { data: UfjContextPayload }) {
	const partes = [data.materiaNome, data.avaliacaoNome ?? null, data.data ? formatarDataCurta(data.data) : null, data.topicoTitulo ?? null, data.arquivoTitulo ?? null].filter((p): p is string => !!p);
	return (
		<div data-testid="ufj-context-card" className="my-1 flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
			<GraduationCapIcon aria-hidden="true" className="size-3.5 shrink-0" />
			<span className="font-medium">Contexto UFJ</span>
			<span className="min-w-0 flex-1 truncate">{partes.join(" · ")}</span>
		</div>
	);
}
