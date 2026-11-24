"use client";

/**
 * A DATA DA PROVA COM UM CLIQUE (spec SIGAA §7.5): clicar abre o campo de data;
 * Enter ou sair do campo salva, Esc cancela, "Limpar" apaga. O selo diz de
 * onde veio a data; a do SIGAA avisa que a próxima sincronização a troca.
 */

import { useRef, useState } from "react";
import { formatarData, type OrigemData } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELOS: Record<OrigemData, string> = { sigaa: "do SIGAA", manual: "à mão", plano: "do plano" };

export function DataEditavel({ data, origem, onSalvar, editandoInicial = false }: {
	data?: string;
	origem?: OrigemData;
	onSalvar(data: string | null): void;
	editandoInicial?: boolean;
}) {
	const [editando, setEditando] = useState(editandoInicial);
	const [valor, setValor] = useState(data ?? "");
	const cancelado = useRef(false);

	if (!editando) {
		return (
			<span className="inline-flex items-baseline gap-2">
				<button
					type="button"
					title="Mudar a data"
					className="rounded px-1 text-sm underline decoration-dotted underline-offset-4 hover:bg-accent"
					onClick={() => {
						cancelado.current = false;
						setValor(data ?? "");
						setEditando(true);
					}}
				>
					{data ? formatarData(data) : "sem data"}
				</button>
				{origem && <span data-selo-data={origem} className="rounded border px-1.5 text-xs text-muted-foreground">{SELOS[origem]}</span>}
			</span>
		);
	}

	const salvar = () => {
		if (cancelado.current) return;
		setEditando(false);
		const novo = valor.trim() || null;
		if (novo !== (data ?? null)) onSalvar(novo);
	};

	return (
		<span className="inline-flex flex-col gap-1">
			<span className="inline-flex items-center gap-2">
				<Input
					type="date"
					aria-label="Data da prova"
					className="w-40"
					value={valor}
					autoFocus={!editandoInicial}
					onChange={(e) => setValor(e.target.value)}
					onBlur={salvar}
					onKeyDown={(e) => {
						if (e.key === "Enter") salvar();
						if (e.key === "Escape") {
							cancelado.current = true;
							setValor(data ?? "");
							setEditando(false);
						}
					}}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => {
						cancelado.current = true;
						setEditando(false);
						if (data) onSalvar(null);
					}}
				>
					Limpar
				</Button>
			</span>
			{origem === "sigaa" && <span className="text-xs text-muted-foreground">A próxima sincronização com o SIGAA troca esta data.</span>}
		</span>
	);
}
