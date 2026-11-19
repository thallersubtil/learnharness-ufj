"use client";

/**
 * Importar plano de ensino (spec Etapa A §7.3): escolher o PDF → rascunho
 * feito pelo modelo → revisão no PlanoForm → salvar. Nada é gravado antes do
 * "Salvar na biblioteca". Turma repetida pede confirmação para substituir.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Materia, Turma } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Aviso, BibliotecaPagina, lerResposta } from "./comum";
import { PlanoForm } from "./plano-form";

interface Rascunho {
	materia: Materia;
	turma: Turma;
	avisos: string[];
	custoUsd: number | null;
	existente: { materia: boolean; turma: boolean };
}

const custo = (usd: number | null) => (usd === null ? "custo desconhecido" : `custo estimado US$ ${usd.toFixed(usd < 0.01 ? 4 : 2).replace(".", ",")}`);

export function ImportarPlanoScreen() {
	const router = useRouter();
	const [arquivo, setArquivo] = useState<File | null>(null);
	const [rascunho, setRascunho] = useState<Rascunho | null>(null);
	const [plano, setPlano] = useState<{ materia: Materia; turma: Turma } | null>(null);
	const [estado, setEstado] = useState<"livre" | "lendo" | "salvando" | "confirmar">("livre");
	const [erro, setErro] = useState<string | null>(null);

	async function ler() {
		if (!arquivo) return;
		setEstado("lendo");
		setErro(null);
		try {
			const form = new FormData();
			form.append("plano", arquivo);
			const r = await lerResposta<Rascunho>(await fetch("/api/biblioteca/plano/rascunho", { method: "POST", body: form }));
			setRascunho(r);
			setPlano({ materia: r.materia, turma: r.turma });
		} catch (e) {
			setErro((e as Error).message);
		} finally {
			setEstado("livre");
		}
	}

	async function salvar(substituir: boolean) {
		if (!arquivo || !plano) return;
		setEstado("salvando");
		setErro(null);
		try {
			const form = new FormData();
			form.append("dados", JSON.stringify({ ...plano, substituir }));
			form.append("plano", arquivo);
			const res = await fetch("/api/biblioteca/plano", { method: "POST", body: form });
			if (res.status === 409) {
				setEstado("confirmar");
				return;
			}
			const ok = await lerResposta<{ codigo: string; turma: string }>(res);
			router.push(`/biblioteca/${encodeURIComponent(ok.codigo)}/${encodeURIComponent(ok.turma)}`);
		} catch (e) {
			setErro((e as Error).message);
			setEstado("livre");
		}
	}

	return (
		<BibliotecaPagina titulo="Importar plano de ensino">
			<div className="space-y-4">
				<p className="text-sm text-muted-foreground">
					Escolha o PDF do plano de ensino. O app lê o plano e monta um rascunho com o cronograma, as avaliações e os tópicos de estudo. Você revisa tudo antes de salvar.
				</p>
				<div className="flex flex-wrap items-center gap-2">
					<input type="file" accept="application/pdf,.pdf" aria-label="PDF do plano de ensino" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setRascunho(null); setPlano(null); }} />
					<Button type="button" disabled={!arquivo || estado !== "livre"} onClick={() => void ler()}>
						{estado === "lendo" ? "Lendo o plano…" : "Ler o plano"}
					</Button>
				</div>
				{erro && <Aviso tom="erro">{erro}</Aviso>}
				{rascunho && plano && (
					<>
						<Aviso>
							Rascunho pronto ({custo(rascunho.custoUsd)}). Confira o cronograma, os tópicos e o que cai em cada prova antes de salvar.
							{rascunho.existente.materia && " Esta matéria já está na biblioteca: os tópicos existentes foram reaproveitados."}
						</Aviso>
						<PlanoForm materia={plano.materia} turma={plano.turma} avisos={rascunho.avisos} onChange={setPlano} />
						{estado === "confirmar" ? (
							<div role="alertdialog" aria-label="Substituir turma" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm">
								<span className="flex-1">Esta turma já existe. Substituir?</span>
								<Button type="button" variant="destructive" onClick={() => void salvar(true)}>Substituir</Button>
								<Button type="button" variant="ghost" onClick={() => setEstado("livre")}>Cancelar</Button>
							</div>
						) : (
							<Button type="button" disabled={estado !== "livre"} onClick={() => void salvar(false)}>
								{estado === "salvando" ? "Salvando…" : "Salvar na biblioteca"}
							</Button>
						)}
					</>
				)}
			</div>
		</BibliotecaPagina>
	);
}
