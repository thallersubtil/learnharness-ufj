"use client";

/**
 * A preparação de uma avaliação (spec Etapa A §7.5): contagem regressiva, horas
 * disponíveis, próximos passos e os tópicos do escopo com Aprender e Praticar.
 * Os selos só registram que as sessões aconteceram — não são nota de domínio.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenIcon, DumbbellIcon } from "lucide-react";
import { formatarData, formatarDataCurta, type Passo, type PreparacaoView, type TopicoPreparacao } from "@/src/core";
import { SessionStarter } from "@/components/start-session";
import { useServerEvent } from "@/components/server-events";
import { Button } from "@/components/ui/button";
import { DataEditavel } from "./data-editavel";
import { Input } from "@/components/ui/input";
import { Aviso, BibliotecaPagina, Secao, lerResposta, textoDias } from "./comum";

export function PreparacaoTela({ view, onAprender, onPraticar, onHoras, onData, ocupado = false }: {
	view: PreparacaoView;
	onAprender: (t: TopicoPreparacao) => void;
	onPraticar: (t: TopicoPreparacao) => void;
	onHoras: (horas: number | null) => void;
	/** Mudar a data da prova daqui mesmo (spec SIGAA §7.5). */
	onData?: (data: string | null) => void;
	ocupado?: boolean;
}) {
	const [horas, setHoras] = useState(view.horas === null ? "" : String(view.horas).replace(".", ","));
	const porId = new Map(view.topicos.map((t) => [t.id, t]));
	const abrir = (p: Passo) => {
		const t = porId.get(p.topico);
		if (t) (p.tipo === "aprender" ? onAprender : onPraticar)(t);
	};
	const salvarHoras = () => {
		const n = Number(horas.replace(",", "."));
		onHoras(horas.trim() === "" ? null : Number.isFinite(n) ? n : NaN);
	};
	const { avaliacao } = view;
	return (
		<div className="space-y-2">
			<div className="rounded-lg border px-4 py-3">
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span className="font-title text-xl">{avaliacao.nome}</span>
					{onData ? <DataEditavel data={avaliacao.data} origem={avaliacao.origemData} onSalvar={onData} /> : avaliacao.data && <span className="text-sm">{formatarData(avaliacao.data)}</span>}
					<span className="text-sm font-medium">{textoDias(view.dias)}</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{view.materia.nome}{view.turma.docente ? ` · ${view.turma.docente}` : ""}
					{avaliacao.pontos !== undefined && ` · ${String(avaliacao.pontos).replace(".", ",")} pontos`}
					{avaliacao.duracaoMin !== undefined && ` · ${avaliacao.duracaoMin} min`}
				</p>
				{(avaliacao.peso || view.criteriosMedia) && <p className="mt-1 text-xs text-muted-foreground">{avaliacao.peso ?? view.criteriosMedia}</p>}
				<label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
					<span>Quanto tempo você tem para estudar para esta prova?</span>
					<Input className="w-24" inputMode="decimal" aria-label="Horas disponíveis" value={horas} onChange={(e) => setHoras(e.target.value)} onBlur={salvarHoras} onKeyDown={(e) => { if (e.key === "Enter") salvarHoras(); }} />
					<span className="text-muted-foreground">horas</span>
				</label>
			</div>

			{view.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}

			{view.passos.length > 0 && (
				<Secao titulo="Próximos passos">
					<ol className="space-y-1">
						{view.passos.map((p) => (
							<li key={`${p.tipo}:${p.topico}`}>
								<button type="button" disabled={ocupado} onClick={() => abrir(p)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
									{p.tipo === "aprender" ? <BookOpenIcon className="size-4 shrink-0" /> : <DumbbellIcon className="size-4 shrink-0" />}
									{p.texto}
								</button>
							</li>
						))}
					</ol>
				</Secao>
			)}

			<Secao titulo="Tópicos">
				<ul className="space-y-2">
					{view.topicos.map((t) => (
						<li key={t.id} className="rounded-lg border px-3 py-2">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{t.titulo}</span>
								{t.aulaFeita && <span data-selo="aula-feita" className="rounded border px-1.5 text-xs text-muted-foreground">aula feita</span>}
								{t.praticado && <span data-selo="praticado" className="rounded border px-1.5 text-xs text-muted-foreground">praticado</span>}
								<span className="flex-1" />
								<Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => onAprender(t)}>Aprender</Button>
								<Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => onPraticar(t)}>Praticar</Button>
							</div>
							<p className="mt-1 text-xs text-muted-foreground">
								{t.aulas.map((a) => `Aula ${a.rotulo}${a.data ? ` (${formatarDataCurta(a.data)})` : ""}`).join(" · ")}
								{t.referencias > 0 && ` · ${t.referencias} material(is)`}
							</p>
							{t.sessoes.length > 0 && (
								<p className="mt-1 flex flex-wrap gap-x-3 text-xs">
									{t.sessoes.map((s) => (
										<Link key={s.id} href={`/chat/${encodeURIComponent(s.id)}`} className="text-muted-foreground underline">
											{s.kind === "practice" ? "Prática" : "Aula"}: {s.title}
										</Link>
									))}
								</p>
							)}
						</li>
					))}
				</ul>
			</Secao>
		</div>
	);
}

export function PreparacaoScreen({ codigo, turmaId, avaliacaoId }: { codigo: string; turmaId: string; avaliacaoId: string }) {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [view, setView] = useState<PreparacaoView | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [ocupado, setOcupado] = useState(false);
	const qs = `materia=${encodeURIComponent(codigo)}&turma=${encodeURIComponent(turmaId)}&avaliacao=${encodeURIComponent(avaliacaoId)}`;
	const carregar = useCallback(() => {
		fetch(`/api/biblioteca/preparacao?${qs}`, { cache: "no-store" })
			.then((res) => lerResposta<PreparacaoView>(res))
			.then((v) => { setView(v); setErro(null); })
			.catch((e: Error) => setErro(e.message));
	}, [qs]);
	useEffect(carregar, [carregar]);
	useServerEvent("biblioteca-changed", carregar);
	useServerEvent("chats-changed", carregar);

	async function abrir(t: TopicoPreparacao, kind: "teach" | "practice") {
		setOcupado(true);
		setErro(null);
		try {
			const prompt = kind === "teach" ? t.promptAprender : t.promptPraticar;
			const destino = await starter.current.start({ title: prompt, ...(kind === "practice" ? { kind: "practice" as const } : {}), ufjContext: t.ufjContext, prefill: prompt }, fetch);
			router.push(destino);
		} catch (e) {
			setErro((e as Error).message);
			setOcupado(false);
		}
	}

	async function data(valor: string | null) {
		try {
			await lerResposta(await fetch(`/api/biblioteca/materias/${encodeURIComponent(codigo)}/turmas/${encodeURIComponent(turmaId)}/avaliacoes/${encodeURIComponent(avaliacaoId)}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data: valor }),
			}));
			carregar();
		} catch (e) {
			setErro((e as Error).message);
		}
	}

	async function horas(valor: number | null) {
		try {
			await lerResposta(await fetch("/api/biblioteca/preparacao", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ materia: codigo, turma: turmaId, avaliacao: avaliacaoId, horas: valor }),
			}));
			carregar();
		} catch (e) {
			setErro((e as Error).message);
		}
	}

	return (
		<BibliotecaPagina
			titulo={view ? `Preparação · ${view.avaliacao.id}` : "Preparação"}
			acoes={<Link href={`/biblioteca/${encodeURIComponent(codigo)}/${encodeURIComponent(turmaId)}`} className="text-sm text-muted-foreground hover:underline">{view?.materia.nome ?? "Turma"}</Link>}
		>
			{erro && <Aviso tom="erro">{erro}</Aviso>}
			{!view && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
			{view && <PreparacaoTela key={`${view.avaliacao.id}:${view.horas}`} view={view} ocupado={ocupado} onAprender={(t) => void abrir(t, "teach")} onPraticar={(t) => void abrir(t, "practice")} onHoras={(h) => void horas(h)} onData={(d) => void data(d)} />}
		</BibliotecaPagina>
	);
}
