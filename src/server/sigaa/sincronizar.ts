/**
 * SINCRONIZAÇÃO COM O SIGAA (spec SIGAA §7.2–7.4). Conectar faz um login de
 * verdade e, se der certo, guarda a conta (senha cifrada pelo chaveiro) e
 * segue a leitura na mesma sessão. "Sincronizar agora" decifra a senha e faz
 * um login por sincronização. Senha recusada nunca é tentada de novo: o aluno
 * precisa conectar a conta outra vez. Uma sincronização por vez.
 *
 * A gravação de cada turma é síncrona, sem `await` entre ler e gravar: uma
 * edição do aluno feita durante a leitura é lida e fundida, não sobrescrita.
 */

import { MAX_IMPORT_BODY_BYTES } from "../../../lib/notes-import-limits.ts";
import { BibliotecaEntradaError } from "../../core/biblioteca.ts";
import { emit } from "../../core/events.ts";
import type { BibliotecaStore, EstadoSigaa, SigaaStore } from "../../core/ports.ts";
import { idTurmaSigaa, montarDoSigaa, nomeDeDisciplina, type SigaaTurmaLida } from "../../core/sigaa.ts";
import { sigaaStore } from "../../store/sigaa.ts";
import { stores } from "../stores.ts";
import { SigaaSenhaRecusadaError } from "./erros.ts";
import { SigaaSessao, baseDoSigaa, type Pagina } from "./http.ts";
import { entrar, sair } from "./login.ts";
import { lerSigaa, type ArquivoBaixado } from "./navegar.ts";
import { cifrarSegredo, decifrarSegredo } from "./segredo.ts";

export class SigaaOcupadoError extends Error {
	constructor(message = "Já há uma sincronização com o SIGAA em andamento.") {
		super(message);
		this.name = "SigaaOcupadoError";
	}
}

export interface SincronizacaoDeps {
	biblioteca: BibliotecaStore;
	sigaa: SigaaStore;
	cifrar: (texto: string) => Promise<string>;
	decifrar: (cifrado: string) => Promise<string>;
	novaSessao: () => SigaaSessao;
	agora: () => Date;
	/** Avisa as telas: "sigaa-changed" e "biblioteca-changed". */
	emitir: () => void;
}

const SENHA_GUARDADA_RECUSADA = "O SIGAA recusou a senha guardada. Conecte a conta de novo.";

export function createSincronizacao(deps: SincronizacaoDeps) {
	let andamento: Promise<void> | null = null;
	const agora = () => deps.agora().toISOString();

	function estado(): EstadoSigaa {
		const e = deps.sigaa.readEstado();
		// Um "sincronizando" sem leitura em curso sobrou de um app fechado no meio.
		if (e.situacao === "sincronizando" && !andamento) return { ...e, situacao: deps.sigaa.readConta() ? "ocioso" : "sem-conta" };
		return e;
	}

	function gravar(e: EstadoSigaa): void {
		deps.sigaa.writeEstado(e);
		deps.emitir();
	}

	function aoLerTurma(lida: SigaaTurmaLida, baixados: ArquivoBaixado[], avisos: string[]): void {
		const { biblioteca } = deps;
		const turmaId = idTurmaSigaa(lida.semestre, lida.sufixo);
		const materia = biblioteca.readMateria(lida.codigo);
		const turma = materia ? biblioteca.readTurma(lida.codigo, turmaId) : null;
		const referencias = biblioteca.readReferencias(lida.codigo, turmaId);
		const arquivos = [...referencias.arquivos];
		for (const b of baixados) {
			const r = biblioteca.addReferenciaFile(lida.codigo, turmaId, b.nome, b.bytes);
			if (!arquivos.some((a) => a.arquivo === r.arquivo)) arquivos.push({ arquivo: r.arquivo, sha256: r.sha256, sigaaId: b.sigaaId, titulo: b.nome, topicos: [] });
		}
		const m = montarDoSigaa(lida, { materia, turma, referencias: { ...referencias, arquivos } }, agora());
		biblioteca.writeMateria(m.materia);
		biblioteca.writeTurma(lida.codigo, m.turma);
		biblioteca.writeReferencias(lida.codigo, turmaId, m.referencias);
		avisos.push(...m.avisos);
	}

	async function lerEGravar(sessao: SigaaSessao, portal: Pagina, usuario: string, inicio: string): Promise<void> {
		const anterior = deps.sigaa.readEstado();
		try {
			const avisos: string[] = [];
			const leitura = await lerSigaa(sessao, portal, {
				jaBaixado: (l, sigaaId) => deps.biblioteca.readReferencias(l.codigo, idTurmaSigaa(l.semestre, l.sufixo)).arquivos.some((a) => a.sigaaId === sigaaId),
				aoLerTurma: (lida, baixados) => aoLerTurma(lida, baixados, avisos),
				tamanhoMaximo: MAX_IMPORT_BODY_BYTES,
			});
			for (const f of leitura.falhas) avisos.push(`Não consegui ler ${nomeDeDisciplina(f.nome)}: ${f.erro}`);
			gravar({ situacao: "ocioso", usuario, ultimaTentativa: inicio, ultimoSucesso: agora(), avisos });
		} catch (err) {
			falhou(err, usuario, inicio, anterior.ultimoSucesso);
		} finally {
			await sair(sessao);
			deps.emitir();
		}
	}

	function falhou(err: unknown, usuario: string, inicio: string, ultimoSucesso?: string): void {
		const base = { usuario, ultimaTentativa: inicio, ...(ultimoSucesso ? { ultimoSucesso } : {}), avisos: [] };
		if (err instanceof SigaaSenhaRecusadaError) return gravar({ ...base, situacao: "senha-recusada", erro: SENHA_GUARDADA_RECUSADA });
		if (!(err instanceof Error) || !err.name.startsWith("Sigaa")) console.error("[sigaa] erro inesperado na sincronização:", err instanceof Error ? err.name : typeof err);
		const erro = err instanceof Error && err.name.startsWith("Sigaa") ? err.message : "Erro inesperado na sincronização com o SIGAA.";
		gravar({ ...base, situacao: "erro", erro });
	}

	function iniciar(tarefa: () => Promise<void>): void {
		andamento = tarefa().finally(() => {
			andamento = null;
		});
	}

	return {
		estado,

		/** Login de verdade; se der certo, grava a conta e segue a leitura em segundo plano. */
		async conectar(usuarioBruto: string, senha: string): Promise<EstadoSigaa> {
			const usuario = usuarioBruto.trim();
			if (!usuario || !senha) throw new BibliotecaEntradaError("Informe usuário e senha.");
			if (andamento) throw new SigaaOcupadoError();
			const senhaCifrada = await deps.cifrar(senha); // sem chaveiro, nem tenta o login
			const sessao = deps.novaSessao();
			const portal = await entrar(sessao, usuario, senha); // senha recusada: lança, nada gravado
			const inicio = agora();
			deps.sigaa.writeConta({ usuario, senhaCifrada });
			gravar({ ...deps.sigaa.readEstado(), situacao: "sincronizando", usuario, ultimaTentativa: inicio, avisos: [] });
			iniciar(() => lerEGravar(sessao, portal, usuario, inicio));
			return estado();
		},

		sincronizarAgora(): EstadoSigaa {
			if (andamento) return estado();
			const conta = deps.sigaa.readConta();
			if (!conta) {
				const e: EstadoSigaa = { situacao: "sem-conta", avisos: ["Conecte sua conta UFJ primeiro."] };
				gravar(e);
				return e;
			}
			const e0 = deps.sigaa.readEstado();
			if (e0.situacao === "senha-recusada") return e0;
			const inicio = agora();
			const { erro: _e, ...resto } = e0;
			gravar({ ...resto, situacao: "sincronizando", usuario: conta.usuario, ultimaTentativa: inicio });
			iniciar(async () => {
				let sessao: SigaaSessao | null = null;
				try {
					const senha = await deps.decifrar(conta.senhaCifrada);
					sessao = deps.novaSessao();
					const portal = await entrar(sessao, conta.usuario, senha);
					await lerEGravar(sessao, portal, conta.usuario, inicio);
				} catch (err) {
					falhou(err, conta.usuario, inicio, e0.ultimoSucesso);
				}
			});
			return estado();
		},

		/** Apaga a conta e a senha guardada; os dados já baixados ficam. */
		sair(): EstadoSigaa {
			deps.sigaa.apagarConta();
			const e: EstadoSigaa = { situacao: "sem-conta", avisos: [] };
			gravar(e);
			return e;
		},

		/** Para os testes: a sincronização em andamento, se houver. */
		emAndamento(): Promise<void> | null {
			return andamento;
		},
	};
}

export type Sincronizacao = ReturnType<typeof createSincronizacao>;

export const sincronizacao: Sincronizacao = createSincronizacao({
	biblioteca: stores.bibliotecaStore,
	sigaa: sigaaStore,
	cifrar: cifrarSegredo,
	decifrar: decifrarSegredo,
	novaSessao: () => new SigaaSessao({ base: baseDoSigaa(), esperarMs: 800 }),
	agora: () => new Date(),
	emitir: () => {
		emit("sigaa-changed", {});
		emit("biblioteca-changed", {});
	},
});
