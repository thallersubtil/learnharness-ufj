"use client";

/** OS TÓPICOS DE AULA DO SIGAA EM LINHA DO TEMPO (spec SIGAA §7.7): só data e
 *  título; os arquivos ficam na aba de materiais (spec chat+SIGAA §5.6). */

import { formatarDataCurta, type Turma } from "@/src/core";

export function TopicosDeAula({ turma }: { turma: Turma }) {
	return (
		<ol className="space-y-1">
			{turma.aulas.map((a) => {
				const cancelada = a.sigaa?.cancelada === true;
				const prova = a.sigaa?.prova === true;
				return (
					<li
						key={a.ordem}
						data-aula={a.ordem}
						data-cancelada={cancelada ? "true" : undefined}
						data-prova={prova ? "true" : undefined}
						className={`rounded-md px-2 py-1 text-sm ${cancelada ? "text-muted-foreground opacity-60" : ""}`}
					>
						<div className="flex flex-wrap items-baseline gap-2">
							<span className="w-12 shrink-0 text-muted-foreground">{a.data ? formatarDataCurta(a.data) : "—"}</span>
							<span>{a.sigaa?.titulo ?? a.conteudo}</span>
							{cancelada && <span className="text-xs">· não houve aula</span>}
							{prova && <span className="rounded border px-1.5 text-xs">prova</span>}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
