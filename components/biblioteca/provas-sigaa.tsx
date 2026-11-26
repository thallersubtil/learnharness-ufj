"use client";

/**
 * AS PROVAS DE UMA TURMA DO SIGAA (spec SIGAA §7.5–7.7): data editável com o
 * selo de origem, contagem de dias, o link da preparação, "Adicionar prova" e,
 * por prova, o conteúdo que cai nela (as caixas gravam as escolhas do aluno).
 */

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { TIPOS_COM_ESCOPO, diasAte, type Materia, type Turma } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textoDias } from "./comum";
import { DataEditavel } from "./data-editavel";

const COM_PREPARACAO = new Set<string>(TIPOS_COM_ESCOPO);

export interface AcoesProvas {
	onData(avaliacaoId: string, data: string | null): void;
	onAdicionar(entrada: { nome: string; data?: string }): void;
	onEscopo(avaliacaoId: string, topicos: string[]): void;
	onRenomear(avaliacaoId: string, nome: string): void;
	onApagar(avaliacaoId: string): void;
}

export function ProvasSigaa({ materia, turma, hoje, onData, onAdicionar, onEscopo, onRenomear, onApagar }: { materia: Materia; turma: Turma; hoje: Date } & AcoesProvas) {
	const [nome, setNome] = useState("");
	const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
	const [apagando, setApagando] = useState<string | null>(null);
	// As escolhas de conteúdo que o aluno acabou de fazer, antes de a tela recarregar:
	// cada clique parte da escolha anterior, não da lista antiga (cliques rápidos).
	const escolhas = useRef<Record<string, string[]>>({});
	const [, redesenhar] = useState(0);
	const chave = turma.avaliacoes.map((a) => `${a.id}:${a.escopo.topicos.join(",")}`).join("|");
	useEffect(() => {
		escolhas.current = {};
		redesenhar((n) => n + 1);
	}, [chave]);
	const escopoDe = (id: string, doServidor: string[]) => escolhas.current[id] ?? doServidor;
	function alternar(id: string, doServidor: string[], topico: string, marcado: boolean) {
		const atual = escopoDe(id, doServidor);
		const novo = marcado ? [...atual.filter((x) => x !== topico), topico] : atual.filter((x) => x !== topico);
		escolhas.current = { ...escolhas.current, [id]: novo };
		redesenhar((n) => n + 1);
		onEscopo(id, novo);
	}
	const [data, setData] = useState("");
	const base = `/biblioteca/${encodeURIComponent(materia.codigo)}/${encodeURIComponent(turma.id)}`;
	const provas = turma.avaliacoes.filter((a) => COM_PREPARACAO.has(a.tipo)).sort((a, b) => (a.data ?? "9999").localeCompare(b.data ?? "9999"));
	const daTurma = new Set(turma.aulas.flatMap((a) => a.topicos));
	const topicos = materia.topicos.filter((t) => !t.arquivado && daTurma.has(t.id));

	function adicionar(e: FormEvent) {
		e.preventDefault();
		if (!nome.trim()) return;
		onAdicionar({ nome: nome.trim(), ...(data ? { data } : {}) });
		setNome("");
		setData("");
	}

	return (
		<div className="space-y-3">
			<ul className="space-y-2">
				{provas.map((av) => (
					<li key={av.id} className="rounded-md border px-3 py-2">
						<div className="flex flex-wrap items-baseline gap-2 text-sm">
							{renomeando?.id === av.id ? (
								<form
									className="inline-flex items-center gap-1"
									onSubmit={(e) => {
										e.preventDefault();
										if (renomeando.nome.trim()) onRenomear(av.id, renomeando.nome.trim());
										setRenomeando(null);
									}}
								>
									<Input className="h-7 w-44" aria-label="Novo nome da prova" autoFocus value={renomeando.nome} onChange={(e) => setRenomeando({ id: av.id, nome: e.target.value })} />
									<Button type="submit" size="sm" variant="outline">Salvar</Button>
									<Button type="button" size="sm" variant="ghost" onClick={() => setRenomeando(null)}>Cancelar</Button>
								</form>
							) : (
								<span className="font-medium">{av.nome}</span>
							)}
							<DataEditavel data={av.data} origem={av.origemData} onSalvar={(d) => onData(av.id, d)} />
							<span className="text-muted-foreground">{textoDias(av.data ? diasAte(av.data, hoje) : null)}</span>
							<span className="flex-1" />
							{!av.sigaaId && renomeando?.id !== av.id && (
								<span data-prova-acoes={av.id} className="inline-flex gap-1">
									<Button type="button" size="sm" variant="ghost" onClick={() => setRenomeando({ id: av.id, nome: av.nome })}>Renomear</Button>
									<Button type="button" size="sm" variant="ghost" onClick={() => setApagando(av.id)}>Apagar</Button>
								</span>
							)}
							<Link href={`${base}/${encodeURIComponent(av.id)}`} className="rounded-md border px-2 py-0.5 hover:bg-accent">Preparar</Link>
						</div>
						{apagando === av.id && (
							<div role="alertdialog" aria-label="Apagar prova" className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 px-3 py-1.5 text-sm">
								<span className="flex-1">Apagar a prova “{av.nome}”? As sessões já feitas continuam.</span>
								<Button type="button" size="sm" variant="destructive" onClick={() => { setApagando(null); onApagar(av.id); }}>Apagar</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => setApagando(null)}>Cancelar</Button>
							</div>
						)}
						<details className="mt-1">
							<summary className="cursor-pointer text-xs text-muted-foreground">Conteúdo da prova ({escopoDe(av.id, av.escopo.topicos).length} tópico(s))</summary>
							<div className="mt-2 grid gap-1 sm:grid-cols-2">
								{topicos.map((t) => {
									const marcado = escopoDe(av.id, av.escopo.topicos).includes(t.id);
									return (
										<label key={t.id} className="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												data-escopo={`${av.id}:${t.id}`}
												checked={marcado}
												onChange={(e) => alternar(av.id, av.escopo.topicos, t.id, e.target.checked)}
											/>
											{t.titulo}
										</label>
									);
								})}
							</div>
						</details>
					</li>
				))}
				{provas.length === 0 && <li className="text-sm text-muted-foreground">O SIGAA ainda não tem data de prova desta turma. Adicione a prova com a data que o professor passou.</li>}
			</ul>
			<form className="flex flex-wrap items-center gap-2" onSubmit={adicionar}>
				<Input className="w-48" aria-label="Nome da prova" placeholder="Nome da prova" value={nome} onChange={(e) => setNome(e.target.value)} />
				<Input className="w-40" type="date" aria-label="Data da prova nova" value={data} onChange={(e) => setData(e.target.value)} />
				<Button type="submit" variant="outline" size="sm" disabled={!nome.trim()}>Adicionar prova</Button>
			</form>
		</div>
	);
}
