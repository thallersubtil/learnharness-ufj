"use client";

/**
 * A página inicial da biblioteca UFJ (spec Etapa A §7.1): matérias, turmas e
 * as provas de cada turma com a contagem regressiva. Trabalhos, listas e
 * apresentações aparecem no plano, mas não ganham preparação.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UploadIcon } from "lucide-react";
import { TIPOS_COM_ESCOPO, diasAte, formatarData, type EstadoSigaa, type Materia, type Turma } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { CartaoSigaa, useEstadoSigaa } from "@/components/sigaa/conta-ufj";
import { Aviso, BibliotecaPagina, lerResposta, textoDias } from "./comum";

const COM_PREPARACAO = new Set<string>(TIPOS_COM_ESCOPO);

export function BibliotecaHome({ materias, problemas, hoje, sigaa, onSincronizar }: {
	materias: { materia: Materia; turmas: Turma[] }[];
	problemas: string[];
	hoje: Date;
	sigaa?: EstadoSigaa;
	onSincronizar?: () => void;
}) {
	return (
		<div className="space-y-6">
			{sigaa && <CartaoSigaa estado={sigaa} onSincronizar={onSincronizar} />}
			<div className="flex items-center gap-3">
				<p className="flex-1 text-sm text-muted-foreground">As matérias do semestre, as provas e a preparação de cada uma.</p>
				<Link href="/biblioteca/importar" className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
					<UploadIcon className="size-4" />
					Importar plano de ensino
				</Link>
			</div>
			{problemas.map((p) => <Aviso key={p}>{p}</Aviso>)}
			{materias.length === 0 ? (
				<Aviso>Nenhuma matéria ainda. Conecte sua conta UFJ ou importe um plano de ensino.</Aviso>
			) : (
				materias.map(({ materia, turmas }) => (
					<div key={materia.codigo} className="rounded-lg border px-4 py-3">
						<div className="flex items-baseline gap-2">
							<h2 className="font-title text-xl">{materia.nome}</h2>
							<span className="text-xs text-muted-foreground">{materia.codigo}</span>
						</div>
						{turmas.map((turma) => {
							const provas = turma.avaliacoes.filter((a) => COM_PREPARACAO.has(a.tipo));
							const base = `/biblioteca/${encodeURIComponent(materia.codigo)}/${encodeURIComponent(turma.id)}`;
							return (
								<div key={turma.id} className="mt-3">
									<Link href={base} className="text-sm hover:underline">
										{turma.semestre}{turma.docente.nome ? ` · ${turma.docente.nome}` : ""}
									</Link>
									<ul className="mt-1 space-y-1">
										{provas.map((av) => {
											const dias = av.data ? diasAte(av.data, hoje) : null;
											return (
												<li key={av.id}>
													<Link href={`${base}/${encodeURIComponent(av.id)}`} className="flex items-baseline gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
														<span className="font-medium">{av.nome}</span>
														{av.data && <span className="text-muted-foreground">{formatarData(av.data)}</span>}
														<span className="text-muted-foreground">{textoDias(dias)}</span>
													</Link>
												</li>
											);
										})}
										{provas.length === 0 && <li className="px-2 text-xs text-muted-foreground">{turma.sigaa ? "Nenhuma prova com data ainda." : "Nenhuma prova no plano."}</li>}
									</ul>
								</div>
							);
						})}
					</div>
				))
			)}
		</div>
	);
}

export function BibliotecaHomeScreen() {
	const [dados, setDados] = useState<{ materias: { materia: Materia; turmas: Turma[] }[]; problemas: string[] } | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const carregar = useCallback(() => {
		fetch("/api/biblioteca", { cache: "no-store" })
			.then((res) => lerResposta<{ materias: { materia: Materia; turmas: Turma[] }[]; problemas: string[] }>(res))
			.then((d) => { setDados(d); setErro(null); })
			.catch((e: Error) => setErro(e.message));
	}, []);
	useEffect(carregar, [carregar]);
	useServerEvent("biblioteca-changed", carregar);
	const sigaa = useEstadoSigaa();
	return (
		<BibliotecaPagina titulo="Matérias">
			{erro && <Aviso tom="erro">{erro}</Aviso>}
			{dados ? <BibliotecaHome materias={dados.materias} problemas={dados.problemas} hoje={new Date()} sigaa={sigaa.estado ?? undefined} onSincronizar={() => void sigaa.sincronizar()} /> : !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
		</BibliotecaPagina>
	);
}
