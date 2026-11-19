"use client";

/**
 * A turma (spec Etapa A §7.3–7.4): resumo do plano, avaliações com o link para
 * a preparação, "Editar plano" (o mesmo formulário da importação) e materiais.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TIPOS_COM_ESCOPO, diasAte, formatarData, type Materia, type Referencias, type Turma } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { Button } from "@/components/ui/button";
import { Aviso, BibliotecaPagina, Secao, lerResposta, textoDias } from "./comum";
import { MateriaisForm } from "./materiais-form";
import { PlanoForm } from "./plano-form";

const COM_PREPARACAO = new Set<string>(TIPOS_COM_ESCOPO);

interface TurmaDados {
	materia: Materia;
	turma: Turma;
	referencias: Referencias;
	arquivos: string[];
}

export function TurmaView({ dados, hoje, onEditar }: { dados: TurmaDados; hoje: Date; onEditar: () => void }) {
	const { materia, turma } = dados;
	const base = `/biblioteca/${encodeURIComponent(materia.codigo)}/${encodeURIComponent(turma.id)}`;
	return (
		<div className="space-y-2">
			<p className="text-sm text-muted-foreground">
				{materia.codigo} · {turma.semestre} · {turma.docente.nome}{turma.turno ? ` · ${turma.turno}` : ""}
			</p>
			<p className="text-sm">{turma.criteriosMedia}</p>
			<Secao titulo="Avaliações" acoes={<Button type="button" variant="outline" size="sm" onClick={onEditar}>Editar plano</Button>}>
				<ul className="space-y-1">
					{turma.avaliacoes.map((av) => {
						const linha = (
							<>
								<span className="font-medium">{av.nome}</span>
								{av.data && <span className="text-muted-foreground">{formatarData(av.data)}</span>}
								<span className="text-muted-foreground">{textoDias(av.data ? diasAte(av.data, hoje) : null)}</span>
								<span className="text-xs text-muted-foreground">{av.escopo.topicos.length} tópico(s)</span>
							</>
						);
						return (
							<li key={av.id}>
								{COM_PREPARACAO.has(av.tipo) ? (
									<Link href={`${base}/${encodeURIComponent(av.id)}`} className="flex flex-wrap items-baseline gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">{linha}</Link>
								) : (
									<div className="flex flex-wrap items-baseline gap-2 px-2 py-1 text-sm text-muted-foreground">{av.nome}{av.data && ` · ${formatarData(av.data)}`}</div>
								)}
							</li>
						);
					})}
				</ul>
			</Secao>
		</div>
	);
}

export function TurmaScreen({ codigo, turmaId }: { codigo: string; turmaId: string }) {
	const [dados, setDados] = useState<TurmaDados | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [edicao, setEdicao] = useState<{ materia: Materia; turma: Turma } | null>(null);
	const [salvando, setSalvando] = useState(false);
	const url = `/api/biblioteca/materias/${encodeURIComponent(codigo)}/turmas/${encodeURIComponent(turmaId)}`;
	const carregar = useCallback(() => {
		fetch(url, { cache: "no-store" })
			.then((res) => lerResposta<TurmaDados>(res))
			.then((d) => { setDados(d); setErro(null); })
			.catch((e: Error) => setErro(e.message));
	}, [url]);
	useEffect(carregar, [carregar]);
	useServerEvent("biblioteca-changed", carregar);

	async function salvarEdicao() {
		if (!edicao) return;
		setSalvando(true);
		setErro(null);
		try {
			const json = (body: unknown) => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
			// Matéria primeiro: tópicos novos precisam existir antes da turma citá-los.
			await lerResposta(await fetch(`/api/biblioteca/materias/${encodeURIComponent(codigo)}`, json(edicao.materia)));
			await lerResposta(await fetch(url, json(edicao.turma)));
			setEdicao(null);
			carregar();
		} catch (e) {
			setErro((e as Error).message);
		} finally {
			setSalvando(false);
		}
	}

	return (
		<BibliotecaPagina titulo={dados?.materia.nome ?? "Turma"} acoes={<Link href="/biblioteca" className="text-sm text-muted-foreground hover:underline">Biblioteca</Link>}>
			{erro && <Aviso tom="erro">{erro}</Aviso>}
			{!dados && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
			{dados && !edicao && (
				<>
					<TurmaView dados={dados} hoje={new Date()} onEditar={() => setEdicao({ materia: dados.materia, turma: dados.turma })} />
					<Secao titulo="Materiais">
						<MateriaisForm codigo={codigo} turmaId={turmaId} materia={dados.materia} arquivos={dados.arquivos} referencias={dados.referencias} onAtualizar={carregar} />
					</Secao>
				</>
			)}
			{dados && edicao && (
				<div className="space-y-4">
					<PlanoForm materia={edicao.materia} turma={edicao.turma} avisos={[]} onChange={setEdicao} />
					<div className="flex gap-2">
						<Button type="button" disabled={salvando} onClick={() => void salvarEdicao()}>{salvando ? "Salvando…" : "Salvar alterações"}</Button>
						<Button type="button" variant="ghost" disabled={salvando} onClick={() => setEdicao(null)}>Cancelar</Button>
					</div>
				</div>
			)}
		</BibliotecaPagina>
	);
}
