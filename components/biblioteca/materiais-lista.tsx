"use client";

/**
 * A ABA DE MATERIAIS DE UMA TURMA DO SIGAA (spec chat+SIGAA §5.5): lista enxuta
 * agrupada por tópico de aula, do mais recente ao mais antigo, com Abrir (no
 * app), Estudar com a IA e, para o que o navegador não abre, Baixar. No fim,
 * o envio de um arquivo extra já ligado a um tópico.
 */

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatarDataCurta, tipoDeMaterial, type Referencias, type Turma } from "@/src/core";
import { Button } from "@/components/ui/button";

export interface AcoesMateriais {
	onEstudar(arquivo: string): void;
	onAdicionar(file: File, topicoId: string): void;
	/** Enquanto um chat é aberto ou um arquivo é enviado: os botões ficam desligados. */
	ocupado?: boolean;
}

export const rotaDoArquivo = (codigo: string, turmaId: string, arquivo: string) =>
	`/api/biblioteca/materias/${encodeURIComponent(codigo)}/turmas/${encodeURIComponent(turmaId)}/arquivos/${encodeURIComponent(arquivo)}`;
export const paginaDoArquivo = (codigo: string, turmaId: string, arquivo: string) =>
	`/biblioteca/${encodeURIComponent(codigo)}/${encodeURIComponent(turmaId)}/arquivo/${encodeURIComponent(arquivo)}`;

export function MateriaisLista({ codigo, turmaId, turma, referencias, onEstudar, onAdicionar, ocupado = false, topicosAtivos }: {
	codigo: string;
	turmaId: string;
	turma: Turma;
	referencias: Referencias;
	/** Os tópicos de estudo ativos da matéria (id e título) para o seletor do envio; padrão: os das aulas da turma. */
	topicosAtivos?: { id: string; titulo: string }[];
} & AcoesMateriais) {
	const [arquivo, setArquivo] = useState<File | null>(null);
	const [topico, setTopico] = useState("");
	// Muda a cada envio para remontar o <input type=file> (não há como limpá-lo pelo estado).
	const [envio, setEnvio] = useState(0);

	// Grupos por aula (ordem), do mais recente ao mais antigo; "Sem tópico" por último.
	const porAula = new Map<number | null, Referencias["arquivos"]>();
	for (const r of referencias.arquivos) {
		const chave = r.aula ?? null;
		porAula.set(chave, [...(porAula.get(chave) ?? []), r]);
	}
	const aulas = turma.aulas;
	const grupos = [...porAula.entries()]
		.filter(([k]) => k !== null)
		.map(([k, lista]) => ({ aula: aulas.find((a) => a.ordem === k), ordem: k as number, lista }))
		.sort((a, b) => (b.aula?.data ?? "").localeCompare(a.aula?.data ?? "") || b.ordem - a.ordem);
	const semTopico = porAula.get(null) ?? [];
	const opcoes = topicosAtivos ?? aulasComoTopicos(turma);

	function enviar(e: FormEvent) {
		e.preventDefault();
		if (!arquivo || !topico) return;
		onAdicionar(arquivo, topico);
		setArquivo(null);
		setEnvio((n) => n + 1);
	}

	const linha = (r: Referencias["arquivos"][number]) => {
		const c = tipoDeMaterial(r.arquivo);
		return (
			<li key={r.arquivo} data-arquivo={r.arquivo} className="flex flex-wrap items-center gap-2 py-1 text-sm">
				<span className="min-w-0 flex-1 truncate">{r.titulo ?? r.arquivo} <span className="text-muted-foreground">· {c.rotulo}</span></span>
				{c.abre ? (
					<>
						<Link href={paginaDoArquivo(codigo, turmaId, r.arquivo)} className="rounded-md border px-2 py-0.5 hover:bg-accent">Abrir</Link>
						<Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => onEstudar(r.arquivo)}>Estudar com a IA</Button>
					</>
				) : (
					<a href={rotaDoArquivo(codigo, turmaId, r.arquivo)} download className="rounded-md border px-2 py-0.5 hover:bg-accent">Baixar</a>
				)}
			</li>
		);
	};

	return (
		<div className="space-y-3">
			{grupos.map((g) => (
				<div key={g.ordem} data-grupo={String(g.ordem)}>
					<p className="text-xs text-muted-foreground">
						{g.aula?.data ? `${formatarDataCurta(g.aula.data)} ` : ""}{g.aula?.sigaa?.titulo ?? g.aula?.conteudo ?? `Aula ${g.ordem}`}
					</p>
					<ul>{g.lista.map(linha)}</ul>
				</div>
			))}
			{semTopico.length > 0 && (
				<div data-grupo="sem-topico">
					<p className="text-xs text-muted-foreground">Sem tópico</p>
					<ul>{semTopico.map(linha)}</ul>
				</div>
			)}
			{referencias.arquivos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum material ainda.</p>}
			<form className="flex flex-wrap items-center gap-2 pt-1" onSubmit={enviar}>
				<input key={envio} type="file" aria-label="Arquivo extra" accept=".pdf,.ipynb,.md,.txt,.c,.h,.py,.java,.png,.jpg,.jpeg" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="text-sm" />
				<select aria-label="Tópico do arquivo" value={topico} onChange={(e) => setTopico(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm">
					<option value="">Tópico…</option>
					{opcoes.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
				</select>
				<Button type="submit" size="sm" variant="outline" disabled={!arquivo || !topico || ocupado}>Adicionar arquivo</Button>
			</form>
		</div>
	);
}

/** Os tópicos de estudo das aulas da turma, na ordem do cronograma, sem repetir. */
function aulasComoTopicos(turma: Turma): { id: string; titulo: string }[] {
	const vistos = new Set<string>();
	const out: { id: string; titulo: string }[] = [];
	for (const a of [...turma.aulas].sort((x, y) => x.ordem - y.ordem)) {
		for (const id of a.topicos) {
			if (vistos.has(id)) continue;
			vistos.add(id);
			out.push({ id, titulo: a.sigaa?.titulo ?? a.conteudo });
		}
	}
	return out;
}
