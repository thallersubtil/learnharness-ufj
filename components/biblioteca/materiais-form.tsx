"use client";

/**
 * Materiais da turma (spec Etapa A §7.4): enviar slides, listas, notebooks e
 * códigos; o modelo sugere a quais tópicos cada arquivo pertence; o dono
 * confere e salva o mapeamento. Copiar o arquivo não grava o mapeamento.
 */

import { useEffect, useState } from "react";
import type { Materia, Referencias } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Aviso, lerResposta } from "./comum";

const ACEITOS = ".pdf,.ipynb,.md,.txt,.c,.h,.py,.java,.png,.jpg,.jpeg";

export function MateriaisForm({ codigo, turmaId, materia, arquivos, referencias, onAtualizar }: {
	codigo: string;
	turmaId: string;
	materia: Materia;
	arquivos: string[];
	referencias: Referencias;
	onAtualizar: () => void;
}) {
	const ativos = materia.topicos.filter((t) => !t.arquivado);
	const inicial = () => Object.fromEntries(arquivos.map((a) => [a, referencias.arquivos.find((r) => r.arquivo === a)?.topicos ?? []]));
	const [mapa, setMapa] = useState<Record<string, string[]>>(inicial);
	const [selecionados, setSelecionados] = useState<File[]>([]);
	const [estado, setEstado] = useState<"livre" | "enviando" | "salvando">("livre");
	const [msg, setMsg] = useState<{ tom: "aviso" | "erro"; texto: string } | null>(null);
	const [sujo, setSujo] = useState(false);

	// Arquivos novos (de outro envio ou de outra janela) entram com o que já estava salvo.
	useEffect(() => {
		setMapa((atual) => ({ ...inicial(), ...Object.fromEntries(Object.entries(atual).filter(([a]) => arquivos.includes(a))) }));
	}, [arquivos.join("\n")]);

	async function enviar() {
		if (selecionados.length === 0) return;
		setEstado("enviando");
		setMsg(null);
		try {
			const form = new FormData();
			for (const f of selecionados) form.append("arquivos", f);
			const r = await lerResposta<{ adicionados: { arquivo: string; reutilizado: boolean }[]; sugestoes: { arquivo: string; topicos: string[] }[] }>(
				await fetch(`/api/biblioteca/materias/${encodeURIComponent(codigo)}/turmas/${encodeURIComponent(turmaId)}/materiais`, { method: "POST", body: form }),
			);
			setMapa((atual) => ({ ...atual, ...Object.fromEntries(r.sugestoes.map((s) => [s.arquivo, s.topicos])) }));
			setSujo(r.sugestoes.length > 0);
			const repetidos = r.adicionados.filter((a) => a.reutilizado).length;
			setMsg({ tom: "aviso", texto: `${r.adicionados.length - repetidos} arquivo(s) novo(s)${repetidos ? `, ${repetidos} já estava(m) na biblioteca` : ""}. Confira os tópicos sugeridos e salve.` });
			setSelecionados([]);
			onAtualizar();
		} catch (e) {
			setMsg({ tom: "erro", texto: (e as Error).message });
		} finally {
			setEstado("livre");
		}
	}

	async function salvar() {
		setEstado("salvando");
		setMsg(null);
		try {
			await lerResposta(
				await fetch(`/api/biblioteca/materias/${encodeURIComponent(codigo)}/turmas/${encodeURIComponent(turmaId)}/materiais`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ arquivos: Object.entries(mapa).map(([arquivo, topicos]) => ({ arquivo, topicos })) }),
				}),
			);
			setSujo(false);
			setMsg({ tom: "aviso", texto: "Materiais salvos." });
			onAtualizar();
		} catch (e) {
			setMsg({ tom: "erro", texto: (e as Error).message });
		} finally {
			setEstado("livre");
		}
	}

	const alternar = (arquivo: string, id: string) => {
		setSujo(true);
		setMapa((m) => ({ ...m, [arquivo]: (m[arquivo] ?? []).includes(id) ? (m[arquivo] ?? []).filter((x) => x !== id) : [...(m[arquivo] ?? []), id] }));
	};

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<input type="file" multiple accept={ACEITOS} aria-label="Materiais da turma" onChange={(e) => setSelecionados([...(e.target.files ?? [])])} />
				<Button type="button" variant="outline" disabled={selecionados.length === 0 || estado !== "livre"} onClick={() => void enviar()}>
					{estado === "enviando" ? "Enviando…" : "Adicionar materiais"}
				</Button>
			</div>
			{msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
			{arquivos.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhum material ainda. Adicione os slides e as listas da turma.</p>
			) : (
				<ul className="space-y-2">
					{arquivos.map((arquivo) => (
						<li key={arquivo} className="rounded-md border px-3 py-2">
							<div className="text-sm font-medium">{arquivo}</div>
							<div className="mt-1 flex flex-wrap gap-1.5">
								{ativos.map((t) => {
									const ligado = (mapa[arquivo] ?? []).includes(t.id);
									return (
										<button key={t.id} type="button" aria-pressed={ligado} onClick={() => alternar(arquivo, t.id)}
											className={ligado ? "rounded border border-foreground/50 bg-accent px-1.5 text-xs" : "rounded border border-dashed px-1.5 text-xs text-muted-foreground"}>
											{t.titulo}
										</button>
									);
								})}
							</div>
						</li>
					))}
				</ul>
			)}
			{arquivos.length > 0 && (
				<Button type="button" disabled={estado !== "livre" || !sujo} onClick={() => void salvar()}>
					{estado === "salvando" ? "Salvando…" : "Salvar materiais"}
				</Button>
			)}
		</div>
	);
}
