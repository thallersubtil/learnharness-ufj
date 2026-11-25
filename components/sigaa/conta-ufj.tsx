"use client";

/**
 * CONTA UFJ (spec SIGAA §7.2, §7.7): conectar a conta do Login Único, ver a
 * última sincronização com o SIGAA, sincronizar agora e sair. A senha só vai
 * para o servidor do app, que a cifra pelo chaveiro e a usa só no SIGAA.
 */

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EstadoSigaa } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aviso, BibliotecaPagina, VoltarParaMaterias, lerResposta } from "@/components/biblioteca/comum";

const SENHA_RECUSADA = "O SIGAA recusou a senha guardada. Conecte a conta de novo.";

/** "05/09/2026, 12:00" na hora local. */
export function dataHora(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function UltimaSincronizacao({ estado }: { estado: EstadoSigaa }) {
	return <p className="text-sm text-muted-foreground">{estado.ultimoSucesso ? `Última sincronização: ${dataHora(estado.ultimoSucesso)}` : "Ainda não sincronizou."}</p>;
}

/** A barra da sincronização: anda por turma e por arquivo, com a frase do que está acontecendo. */
function BarraDeProgresso({ estado }: { estado: EstadoSigaa }) {
	const p = estado.progresso ?? { fracao: 0, texto: "Entrando no SIGAA…" };
	const pct = Math.round(Math.max(0, Math.min(1, p.fracao)) * 100);
	return (
		<div className="space-y-1">
			<p role="status" className="text-sm">Sincronizando com o SIGAA…</p>
			<div role="progressbar" aria-label="Progresso da sincronização" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
				<div className="h-full animate-pulse rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(pct, 3)}%` }} />
			</div>
			<p className="text-sm text-muted-foreground">{p.texto}</p>
			<p className="text-xs text-muted-foreground">Você pode continuar usando o app enquanto isso.</p>
		</div>
	);
}

function Avisos({ avisos }: { avisos: string[] }) {
	return avisos.length ? <div className="space-y-2">{avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}</div> : null;
}

export function ContaUfj({ estado, ocupado, erro, onConectar, onSincronizar, onSair }: {
	estado: EstadoSigaa;
	ocupado: boolean;
	erro: string | null;
	onConectar(usuario: string, senha: string): void;
	onSincronizar(): void;
	onSair(): void;
}) {
	const [usuario, setUsuario] = useState(estado.usuario ?? "");
	const [senha, setSenha] = useState("");
	const conectado = estado.situacao === "ocioso" || estado.situacao === "sincronizando" || estado.situacao === "erro";
	const sincronizando = estado.situacao === "sincronizando";

	function enviar(e: FormEvent) {
		e.preventDefault();
		onConectar(usuario.trim(), senha);
		setSenha("");
	}

	return (
		<div className="space-y-4">
			<h2 className="font-title text-xl">Conta UFJ (SIGAA)</h2>
			<p className="text-sm text-muted-foreground">
				O app entra no SIGAA com a sua conta para montar as matérias, as provas e os arquivos do professor. A senha fica cifrada no chaveiro do Mac e só é enviada ao SIGAA.
			</p>
			{erro && <Aviso tom="erro">{erro}</Aviso>}
			{conectado ? (
				<div className="space-y-3">
					<p className="text-sm">Conectado como <strong>{estado.usuario}</strong></p>
					<UltimaSincronizacao estado={estado} />
					{sincronizando && <BarraDeProgresso estado={estado} />}
					{estado.situacao === "erro" && estado.erro && <Aviso tom="erro">{estado.erro}</Aviso>}
					<Avisos avisos={estado.avisos} />
					<div className="flex flex-wrap gap-2">
						<Button type="button" disabled={ocupado || sincronizando} onClick={onSincronizar}>Sincronizar agora</Button>
						<Button type="button" variant="ghost" disabled={ocupado || sincronizando} onClick={onSair}>Sair da conta</Button>
					</div>
				</div>
			) : (
				<form className="max-w-sm space-y-3" onSubmit={enviar}>
					{estado.situacao === "senha-recusada" && <Aviso tom="erro">{estado.erro ?? SENHA_RECUSADA}</Aviso>}
					<label className="block text-sm">
						Usuário do Login Único
						<Input name="usuario" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
					</label>
					<label className="block text-sm">
						Senha
						<Input name="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
					</label>
					<Button type="submit" disabled={ocupado || !usuario.trim() || !senha}>Entrar</Button>
				</form>
			)}
		</div>
	);
}

/** O cartão do SIGAA no topo da tela Matérias. */
export function CartaoSigaa({ estado, onSincronizar }: { estado: EstadoSigaa; onSincronizar?: () => void }) {
	if (estado.situacao === "sem-conta") {
		return (
			<div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
				<span className="flex-1">Conecte sua conta UFJ para montar as matérias pelo SIGAA.</span>
				<Link href="/conta-ufj" className="rounded-md border px-3 py-1.5 hover:bg-accent">Conectar conta UFJ</Link>
			</div>
		);
	}
	if (estado.situacao === "senha-recusada") {
		return (
			<div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 px-4 py-3 text-sm">
				<span className="flex-1">{SENHA_RECUSADA}</span>
				<Link href="/conta-ufj" className="rounded-md border px-3 py-1.5 hover:bg-accent">Conta UFJ</Link>
			</div>
		);
	}
	return (
		<div className="space-y-2 rounded-lg border px-4 py-3">
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex-1">
					{estado.situacao === "sincronizando" ? <BarraDeProgresso estado={estado} /> : <UltimaSincronizacao estado={estado} />}
				</div>
				{onSincronizar && <Button type="button" size="sm" variant="outline" disabled={estado.situacao === "sincronizando"} onClick={onSincronizar}>Sincronizar agora</Button>}
				<Link href="/conta-ufj" className="text-sm text-muted-foreground hover:underline">Conta UFJ</Link>
			</div>
			{estado.situacao === "erro" && estado.erro && <Aviso tom="erro">{estado.erro}</Aviso>}
			<Avisos avisos={estado.avisos} />
		</div>
	);
}

/** Busca o estado e escuta "sigaa-changed"; usado pela tela Conta UFJ e pela home. */
export function useEstadoSigaa() {
	const [estado, setEstado] = useState<EstadoSigaa | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const carregar = useCallback(() => {
		fetch("/api/sigaa", { cache: "no-store" })
			.then((res) => lerResposta<EstadoSigaa>(res))
			.then((e) => { setEstado(e); setErro(null); })
			.catch((e: Error) => setErro(e.message));
	}, []);
	useEffect(carregar, [carregar]);
	useServerEvent("sigaa-changed", carregar);
	const sincronizar = useCallback(async () => {
		try {
			setEstado(await lerResposta<EstadoSigaa>(await fetch("/api/sigaa/sincronizar", { method: "POST" })));
		} catch (e) {
			setErro((e as Error).message);
		}
	}, []);
	return { estado, erro, setEstado, setErro, sincronizar };
}

export function ContaUfjScreen() {
	const { estado, erro, setEstado, setErro, sincronizar } = useEstadoSigaa();
	const [ocupado, setOcupado] = useState(false);

	async function pedir(fazer: () => Promise<Response>) {
		setOcupado(true);
		setErro(null);
		try {
			setEstado(await lerResposta<EstadoSigaa>(await fazer()));
		} catch (e) {
			setErro((e as Error).message);
		} finally {
			setOcupado(false);
		}
	}

	return (
		<BibliotecaPagina titulo="Conta UFJ" acoes={<VoltarParaMaterias />}>
			{!estado && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
			{!estado && erro && <Aviso tom="erro">{erro}</Aviso>}
			{estado && (
				<ContaUfj
					estado={estado}
					ocupado={ocupado}
					erro={erro}
					onConectar={(usuario, senha) => void pedir(() => fetch("/api/sigaa/conta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, senha }) }))}
					onSincronizar={() => void sincronizar()}
					onSair={() => void pedir(() => fetch("/api/sigaa/conta", { method: "DELETE" }))}
				/>
			)}
		</BibliotecaPagina>
	);
}
