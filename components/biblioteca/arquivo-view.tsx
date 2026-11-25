"use client";

/**
 * UM MATERIAL ABERTO DENTRO DO APP (spec chat+SIGAA §5.5): título, tópico, o
 * botão "Estudar com a IA" e o conteúdo. PDF no visualizador do navegador
 * (iframe); texto, código e cadernos convertidos como Markdown; imagens direto.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { promptMaterial, tipoDeMaterial, type Materia, type Referencias, type TipoDeMaterial, type Turma } from "@/src/core";
import { HostMarkdown } from "@/components/host-markdown";
import { SessionStarter } from "@/components/start-session";
import { Button } from "@/components/ui/button";
import { Aviso, BibliotecaPagina, lerResposta } from "./comum";
import { rotaDoArquivo } from "./materiais-lista";

export function ArquivoView({ titulo, topicoTitulo, tipo, linguagem, url, texto, ocupado = false, onEstudar }: {
	titulo: string;
	topicoTitulo?: string;
	tipo: TipoDeMaterial;
	linguagem?: string;
	url: string;
	texto?: string;
	ocupado?: boolean;
	onEstudar(): void;
}) {
	const corpo = tipo === "texto" && texto !== undefined ? (linguagem ? `\`\`\`${linguagem}\n${texto}\n\`\`\`` : texto) : null;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex flex-wrap items-baseline gap-2">
				<h2 className="font-title text-xl">{titulo}</h2>
				{topicoTitulo && <span className="text-sm text-muted-foreground">{topicoTitulo}</span>}
				<span className="flex-1" />
				<Button type="button" size="sm" disabled={ocupado} onClick={onEstudar}>Estudar com a IA</Button>
			</div>
			{tipo === "pdf" && <iframe title={titulo} src={url} className="min-h-[70vh] w-full flex-1 rounded-md border bg-background" />}
			{tipo === "imagem" && <img src={url} alt={titulo} className="max-w-full rounded-md border" />}
			{tipo === "texto" && (corpo !== null ? <div data-arquivo-texto className="rounded-md border px-4 py-3"><HostMarkdown text={corpo} /></div> : <p className="text-sm text-muted-foreground">Carregando…</p>)}
			{tipo === "outro" && <p className="text-sm text-muted-foreground">Este formato não abre no app. <a href={url} download className="underline">Baixar</a></p>}
		</div>
	);
}

interface TurmaDados {
	materia: Materia;
	turma: Turma;
	referencias: Referencias;
}

export function ArquivoScreen({ codigo, turmaId, nome }: { codigo: string; turmaId: string; nome: string }) {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [dados, setDados] = useState<TurmaDados | null>(null);
	const [texto, setTexto] = useState<string | undefined>(undefined);
	const [erro, setErro] = useState<string | null>(null);
	const [ocupado, setOcupado] = useState(false);
	const url = rotaDoArquivo(codigo, turmaId, nome);
	const classe = tipoDeMaterial(nome);

	const carregar = useCallback(() => {
		fetch(`/api/biblioteca/materias/${encodeURIComponent(codigo)}/turmas/${encodeURIComponent(turmaId)}`, { cache: "no-store" })
			.then((res) => lerResposta<TurmaDados>(res))
			.then((d) => { setDados(d); setErro(null); })
			.catch((e: Error) => setErro(e.message));
	}, [codigo, turmaId]);
	useEffect(carregar, [carregar]);
	useEffect(() => {
		if (classe.tipo !== "texto") return;
		fetch(url, { cache: "no-store" })
			.then((res) => (res.ok ? res.text() : Promise.reject(new Error("Não consegui abrir o arquivo."))))
			.then(setTexto)
			.catch((e: Error) => setErro(e.message));
	}, [url, classe.tipo]);

	const ref = dados?.referencias.arquivos.find((a) => a.arquivo === nome);
	const topico = ref?.topicos[0] ? dados?.materia.topicos.find((t) => t.id === ref.topicos[0]) : undefined;

	async function estudar() {
		if (!dados) return;
		setOcupado(true);
		setErro(null);
		try {
			const prompt = promptMaterial({ materia: codigo, turma: turmaId, origem: "material", arquivo: nome, materiaNome: dados.materia.nome, docente: dados.turma.docente.nome, arquivoTitulo: ref?.titulo ?? nome });
			const destino = await starter.current.start({ title: prompt, ufjContext: { materia: codigo, turma: turmaId, origem: "material", arquivo: nome, ...(topico ? { topico: topico.id } : {}) }, prefill: prompt }, fetch);
			router.push(destino);
		} catch (e) {
			setErro((e as Error).message);
			setOcupado(false);
		}
	}

	return (
		<BibliotecaPagina titulo={dados?.materia.nome ?? "Material"} acoes={<Link href={`/biblioteca/${encodeURIComponent(codigo)}/${encodeURIComponent(turmaId)}`} className="text-sm text-muted-foreground hover:underline">Materiais</Link>}>
			{erro && <Aviso tom="erro">{erro}</Aviso>}
			{!dados && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
			{dados && (ref ? (
				<ArquivoView titulo={ref.titulo ?? nome} topicoTitulo={topico?.titulo} tipo={classe.tipo} linguagem={classe.linguagem} url={url} texto={texto} ocupado={ocupado} onEstudar={() => void estudar()} />
			) : (
				<Aviso tom="erro">Este arquivo não está na turma.</Aviso>
			))}
		</BibliotecaPagina>
	);
}
