"use client";

/**
 * O formulário de revisão e edição do plano de ensino (spec Etapa A §7.3,
 * passo 4). Controlado: cada mudança devolve a matéria e a turma inteiras.
 *
 * Regras dos tópicos aplicadas aqui, para o servidor nunca receber referência
 * a tópico inativo: arquivar um tópico tira ele das aulas e dos escopos;
 * juntar dois troca as referências do primeiro pelo segundo. Ids nunca mudam.
 */

import { useState } from "react";
import { TIPOS_AVALIACAO, slugify, type Avaliacao, type Materia, type TipoAvaliacao, type Topico, type Turma } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Aviso, Secao } from "./comum";

const ROTULO_TIPO: Record<TipoAvaliacao, string> = {
	"prova-escrita": "Prova escrita",
	"prova-pratica": "Prova prática",
	substitutiva: "Substitutiva",
	recuperacao: "Recuperação",
	trabalho: "Trabalho",
	apresentacao: "Apresentação",
	lista: "Lista de exercícios",
	outra: "Outra",
};

type Plano = { materia: Materia; turma: Turma };

/** Troca (ou remove, com `para` null) um id de tópico em todas as aulas e escopos. */
function trocarReferencias(turma: Turma, de: string, para: string | null): Turma {
	const troca = (ids: string[]) => [...new Set(ids.flatMap((id) => (id === de ? (para ? [para] : []) : [id])))];
	return {
		...turma,
		aulas: turma.aulas.map((a) => ({ ...a, topicos: troca(a.topicos) })),
		avaliacoes: turma.avaliacoes.map((av) => ({ ...av, escopo: { topicos: troca(av.escopo.topicos) } })),
	};
}

function idNovo(titulo: string, existentes: readonly Topico[]): string {
	const base = slugify(titulo) || "topico";
	const usados = new Set(existentes.map((t) => t.id));
	let id = base;
	for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
	return id;
}

const linhas = (texto: string) => texto.split("\n").map((l) => l.trim()).filter(Boolean);
const numeroOuNada = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

export function PlanoForm({ materia, turma, avisos, onChange }: Plano & { avisos: string[]; onChange: (next: Plano) => void }) {
	const [novoTopico, setNovoTopico] = useState("");
	const ativos = materia.topicos.filter((t) => !t.arquivado);
	const arquivados = materia.topicos.filter((t) => t.arquivado);
	const titulo = (id: string) => materia.topicos.find((t) => t.id === id)?.titulo ?? id;
	const set = (m: Materia, t: Turma) => onChange({ materia: m, turma: t });
	const setMateria = (patch: Partial<Materia>) => set({ ...materia, ...patch }, turma);
	const setTopico = (id: string, patch: Partial<Topico>) => setMateria({ topicos: materia.topicos.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
	const setAula = (ordem: number, patch: Partial<Turma["aulas"][number]>) => set(materia, { ...turma, aulas: turma.aulas.map((a) => (a.ordem === ordem ? { ...a, ...patch } : a)) });
	const setAvaliacao = (id: string, patch: Partial<Avaliacao>) => set(materia, { ...turma, avaliacoes: turma.avaliacoes.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

	const arquivar = (id: string) => set({ ...materia, topicos: materia.topicos.map((t) => (t.id === id ? { ...t, arquivado: true } : t)) }, trocarReferencias(turma, id, null));
	const reativar = (id: string) => setTopico(id, { arquivado: undefined });
	const juntar = (de: string, para: string) => set({ ...materia, topicos: materia.topicos.filter((t) => t.id !== de) }, trocarReferencias(turma, de, para));
	const adicionar = () => {
		const t = novoTopico.trim();
		if (!t) return;
		setMateria({ topicos: [...materia.topicos, { id: idNovo(t, materia.topicos), titulo: t }] });
		setNovoTopico("");
	};

	return (
		<div className="space-y-2">
			{avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}

			<Secao titulo="Identificação">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="text-xs text-muted-foreground">Disciplina<Input value={materia.nome} onChange={(e) => setMateria({ nome: e.target.value })} /></label>
					<label className="text-xs text-muted-foreground">Código<Input value={materia.codigo} readOnly /></label>
					<label className="text-xs text-muted-foreground">Curso<Input value={materia.curso} onChange={(e) => setMateria({ curso: e.target.value })} /></label>
					<label className="text-xs text-muted-foreground">Unidade<Input value={materia.unidade} onChange={(e) => setMateria({ unidade: e.target.value })} /></label>
					<label className="text-xs text-muted-foreground">Docente<Input value={turma.docente.nome} readOnly /></label>
					<label className="text-xs text-muted-foreground">Semestre<Input value={turma.semestre} readOnly /></label>
				</div>
			</Secao>

			<Secao titulo="Tópicos">
				<ul className="space-y-2">
					{ativos.map((t) => (
						<li key={t.id} className="flex flex-wrap items-center gap-2">
							<Input className="min-w-48 flex-1" aria-label={`Título do tópico ${t.id}`} value={t.titulo} onChange={(e) => setTopico(t.id, { titulo: e.target.value })} />
							<select
								aria-label={`Juntar ${t.titulo} com outro tópico`}
								className="h-9 rounded-md border bg-transparent px-2 text-sm"
								value=""
								onChange={(e) => e.target.value && juntar(t.id, e.target.value)}
							>
								<option value="">Juntar com…</option>
								{ativos.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
							</select>
							<Button type="button" variant="ghost" size="sm" onClick={() => arquivar(t.id)}>Arquivar</Button>
						</li>
					))}
				</ul>
				<div className="mt-2 flex gap-2">
					<Input placeholder="Novo tópico" value={novoTopico} onChange={(e) => setNovoTopico(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }} />
					<Button type="button" variant="outline" onClick={adicionar}>Adicionar tópico</Button>
				</div>
				{arquivados.length > 0 && (
					<p className="mt-2 text-xs text-muted-foreground">
						Arquivados:{" "}
						{arquivados.map((t, i) => (
							<span key={t.id}>
								{i > 0 && ", "}
								{t.titulo} <button type="button" className="underline" onClick={() => reativar(t.id)}>reativar</button>
							</span>
						))}
					</p>
				)}
			</Secao>

			<Secao titulo="Cronograma">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="text-left text-xs text-muted-foreground">
							<tr><th className="py-1 pr-2">Aula</th><th className="py-1 pr-2">Data</th><th className="py-1 pr-2">Conteúdo</th><th className="py-1">Tópicos</th></tr>
						</thead>
						<tbody>
							{turma.aulas.map((a) => (
								<tr key={a.ordem} className="border-t align-top">
									<td className="py-1 pr-2 whitespace-nowrap">{a.rotulo}{a.avaliacaoId && <span className="ml-1 text-xs text-muted-foreground">({a.avaliacaoId})</span>}</td>
									<td className="py-1 pr-2"><Input type="date" aria-label={`Data da aula ${a.rotulo}`} value={a.data ?? ""} onChange={(e) => setAula(a.ordem, { data: e.target.value || undefined })} /></td>
									<td className="py-1 pr-2"><Input aria-label={`Conteúdo da aula ${a.rotulo}`} value={a.conteudo} onChange={(e) => setAula(a.ordem, { conteudo: e.target.value })} /></td>
									<td className="py-1">
										<div className="flex flex-wrap gap-1">
											{a.topicos.map((id) => (
												<span key={id} className="inline-flex items-center gap-1 rounded border px-1.5 text-xs">
													{titulo(id)}
													<button type="button" aria-label={`Tirar ${titulo(id)} da aula ${a.rotulo}`} onClick={() => setAula(a.ordem, { topicos: a.topicos.filter((x) => x !== id) })}>×</button>
												</span>
											))}
											<select aria-label={`Adicionar tópico à aula ${a.rotulo}`} className="h-6 rounded border bg-transparent text-xs" value="" onChange={(e) => e.target.value && setAula(a.ordem, { topicos: [...a.topicos, e.target.value] })}>
												<option value="">+ tópico</option>
												{ativos.filter((t) => !a.topicos.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
											</select>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Secao>

			<Secao titulo="Avaliações">
				<div className="space-y-4">
					{turma.avaliacoes.map((av) => (
						<div key={av.id} className="rounded-lg border px-3 py-3">
							<div className="grid gap-2 sm:grid-cols-5">
								<label className="text-xs text-muted-foreground sm:col-span-2">Nome ({av.id})<Input value={av.nome} onChange={(e) => setAvaliacao(av.id, { nome: e.target.value })} /></label>
								<label className="text-xs text-muted-foreground">Tipo
									<select className="block h-9 w-full rounded-md border bg-transparent px-2 text-sm" value={av.tipo} onChange={(e) => setAvaliacao(av.id, { tipo: e.target.value as TipoAvaliacao })}>
										{TIPOS_AVALIACAO.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
									</select>
								</label>
								<label className="text-xs text-muted-foreground">Data<Input type="date" value={av.data ?? ""} onChange={(e) => setAvaliacao(av.id, { data: e.target.value || undefined })} /></label>
								<label className="text-xs text-muted-foreground">Pontos<Input inputMode="decimal" value={av.pontos ?? ""} onChange={(e) => setAvaliacao(av.id, { pontos: numeroOuNada(e.target.value) })} /></label>
							</div>
							<fieldset className="mt-2">
								<legend className="text-xs text-muted-foreground">O que cai</legend>
								<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
									{ativos.map((t) => {
										const marcado = av.escopo.topicos.includes(t.id);
										return (
											<label key={t.id} className="inline-flex items-center gap-1.5 text-sm">
												<input
													type="checkbox"
													data-escopo={`${av.id}:${t.id}`}
													checked={marcado}
													onChange={() => setAvaliacao(av.id, { escopo: { topicos: marcado ? av.escopo.topicos.filter((x) => x !== t.id) : [...av.escopo.topicos, t.id] } })}
												/>
												{t.titulo}
											</label>
										);
									})}
								</div>
							</fieldset>
						</div>
					))}
				</div>
			</Secao>

			<Secao titulo="Ementa e bibliografia">
				<label className="block text-xs text-muted-foreground">Ementa<Textarea value={materia.ementa} onChange={(e) => setMateria({ ementa: e.target.value })} /></label>
				<label className="mt-2 block text-xs text-muted-foreground">Bibliografia básica (uma por linha)
					<Textarea defaultValue={materia.bibliografia.basica.join("\n")} onBlur={(e) => setMateria({ bibliografia: { ...materia.bibliografia, basica: linhas(e.target.value) } })} />
				</label>
			</Secao>
		</div>
	);
}
