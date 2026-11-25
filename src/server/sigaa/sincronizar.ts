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

import { BibliotecaEntradaError } from "../../core/biblioteca.ts";
import { emit } from "../../core/events.ts";
import type { BibliotecaStore, EstadoSigaa, SigaaStore } from "../../core/ports.ts";
import { idTurmaSigaa, montarDoSigaa, nomeDeDisciplina, progressoDaLeitura, type SigaaTurmaLida } from "../../core/sigaa.ts";
import { sigaaStore } from "../../store/sigaa.ts";
import { stores } from "../stores.ts";
import { SigaaEstruturaError, SigaaSenhaRecusadaError } from "./erros.ts";
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
	/** Avisa as telas: "sigaa-changed" e, salvo quando é só progresso, "biblioteca-changed". */
	emitir: (soProgresso?: boolean) => void;
	/** Onde fica a sincronização em andamento. Em produção, um só para o processo
	 *  inteiro (cada rota do Next pode ter sua cópia deste módulo). */
	compartilhado?: EmAndamento;
}

/** A sincronização em andamento e o seu progresso (só na memória). */
export interface EmAndamento {
	andamento: Promise<void> | null;
	progresso?: { fracao: number; texto: string } | null;
	/** O aluno saiu da conta durante a sincronização em andamento. */
	cancelada?: boolean;
}

const KEY = Symbol.for("lh.sigaa.sincronizacao");

/** O estado compartilhado entre as cópias do módulo (rotas compiladas à parte). */
function compartilhadoGlobal(): EmAndamento {
	const g = globalThis as typeof globalThis & { [KEY]?: EmAndamento };
	g[KEY] ??= { andamento: null };
	return g[KEY];
}

const ENTRANDO = { fracao: 0, texto: "Entrando no SIGAA…" };

const SENHA_GUARDADA_RECUSADA = "O SIGAA recusou a senha guardada. Conecte a conta de novo.";

export function createSincronizacao(deps: SincronizacaoDeps) {
	const em: EmAndamento = deps.compartilhado ?? { andamento: null };
	const agora = () => deps.agora().toISOString();

	/** Marca a sincronização como em andamento ANTES de qualquer await; devolve o "terminou". */
	function reservar(): () => void {
		let fim!: () => void;
		em.andamento = new Promise<void>((r) => {
			fim = r;
		});
		em.progresso = ENTRANDO;
		em.cancelada = false;
		return () => {
			em.andamento = null;
			em.progresso = null;
			fim();
		};
	}

	function estado(): EstadoSigaa {
		const e = deps.sigaa.readEstado();
		// Um "sincronizando" sem leitura em curso sobrou de um app fechado no meio.
		if (e.situacao === "sincronizando" && !em.andamento) return { ...e, situacao: deps.sigaa.readConta() ? "ocioso" : "sem-conta" };
		if (em.andamento && em.progresso && e.situacao === "sincronizando") return { ...e, progresso: em.progresso };
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
		// Uma leitura sem nenhum tópico de aula, numa turma que tinha, é página que não foi lida:
		// os dados anteriores ficam (sem isso, todos os tópicos seriam arquivados).
		if (lida.topicos.length === 0 && turma && turma.aulas.length > 0) throw new SigaaEstruturaError("nenhum tópico de aula nesta leitura");
		const referencias = biblioteca.readReferencias(lida.codigo, turmaId);
		const arquivos = [...referencias.arquivos];
		for (const b of baixados) {
			// Um arquivo que não pôde ser gravado vira aviso; os outros e a turma seguem.
			let r: ReturnType<BibliotecaStore["addReferenciaFile"]>;
			try {
				r = biblioteca.addReferenciaFile(lida.codigo, turmaId, b.nome, b.bytes);
			} catch (err) {
				avisos.push(`Não consegui guardar "${b.nome}" de ${nomeDeDisciplina(lida.nome)}: ${err instanceof Error ? err.message : String(err)}`);
				continue;
			}
			const i = arquivos.findIndex((a) => a.arquivo === r.arquivo);
			if (i < 0) arquivos.push({ arquivo: r.arquivo, sha256: r.sha256, sigaaId: b.sigaaId, titulo: b.nome, topicos: [] });
			// O mesmo conteúdo já guardado sem o id do SIGAA (ex.: "Salvar materiais" antigo): o id volta.
			else if (!arquivos[i]!.sigaaId) arquivos[i] = { ...arquivos[i]!, sigaaId: b.sigaaId };
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
				noticiaConhecida: (l, sigaaId) => (deps.biblioteca.readTurma(l.codigo, idTurmaSigaa(l.semestre, l.sufixo))?.noticias ?? []).some((n) => n.sigaaId === sigaaId && n.texto !== undefined),
				aoLerTurma: (lida, baixados) => aoLerTurma(lida, baixados, avisos),
				progresso: (p) => {
					em.progresso = progressoDaLeitura(p);
					deps.emitir(true);
				},
				parar: () => em.cancelada === true,
			});
			// Saiu da conta no meio: o estado "sem conta" que o sair() gravou fica.
			if (em.cancelada) return;
			for (const f of leitura.falhas) avisos.push(`Não consegui ler ${nomeDeDisciplina(f.nome)}: ${f.erro}`);
			if (leitura.turmasLidas === 0) {
				// Nada lido não é sucesso: o "último sucesso" continua o anterior.
				const erro = leitura.turmasNoPortal === 0 ? "O SIGAA não mostrou nenhuma turma no portal." : "Não consegui ler nenhuma turma do SIGAA nesta sincronização.";
				gravar({ situacao: "erro", usuario, ultimaTentativa: inicio, ...(anterior.ultimoSucesso ? { ultimoSucesso: anterior.ultimoSucesso } : {}), erro, avisos });
				return;
			}
			gravar({ situacao: "ocioso", usuario, ultimaTentativa: inicio, ultimoSucesso: agora(), avisos });
		} catch (err) {
			if (!em.cancelada) falhou(err, usuario, inicio, anterior.ultimoSucesso);
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

	return {
		estado,

		/** Login de verdade; se der certo, grava a conta e segue a leitura em segundo plano. */
		async conectar(usuarioBruto: string, senha: string): Promise<EstadoSigaa> {
			const usuario = usuarioBruto.trim();
			if (!usuario || !senha) throw new BibliotecaEntradaError("Informe usuário e senha.");
			if (em.andamento) throw new SigaaOcupadoError();
			const terminar = reservar();
			let sessao: SigaaSessao;
			let portal: Pagina;
			let inicio: string;
			try {
				const senhaCifrada = await deps.cifrar(senha); // sem chaveiro, nem tenta o login
				sessao = deps.novaSessao();
				portal = await entrar(sessao, usuario, senha); // senha recusada: lança, nada gravado
				inicio = agora();
				deps.sigaa.writeConta({ usuario, senhaCifrada });
				const { erro: _e, ...resto } = deps.sigaa.readEstado();
				gravar({ ...resto, situacao: "sincronizando", usuario, ultimaTentativa: inicio, avisos: [] });
			} catch (err) {
				terminar();
				throw err;
			}
			void lerEGravar(sessao, portal, usuario, inicio).finally(terminar);
			return estado();
		},

		sincronizarAgora(): EstadoSigaa {
			if (em.andamento) return estado();
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
			const terminar = reservar();
			// Os avisos da sincronização anterior saem: na tela, pareceriam deste momento.
			gravar({ ...resto, situacao: "sincronizando", usuario: conta.usuario, ultimaTentativa: inicio, avisos: [] });
			void (async () => {
				try {
					const senha = await deps.decifrar(conta.senhaCifrada);
					if (em.cancelada) return;
					const sessao = deps.novaSessao();
					const portal = await entrar(sessao, conta.usuario, senha);
					if (em.cancelada) return void (await sair(sessao));
					await lerEGravar(sessao, portal, conta.usuario, inicio);
				} catch (err) {
					if (!em.cancelada) falhou(err, conta.usuario, inicio, e0.ultimoSucesso);
				}
			})().finally(terminar);
			return estado();
		},

		/** Apaga a conta e a senha guardada; os dados já baixados ficam. */
		sair(): EstadoSigaa {
			// Uma sincronização em andamento para na próxima turma ou arquivo e não grava mais nada.
			if (em.andamento) em.cancelada = true;
			deps.sigaa.apagarConta();
			const e: EstadoSigaa = { situacao: "sem-conta", avisos: [] };
			gravar(e);
			return e;
		},

		/** Para os testes: a sincronização em andamento, se houver. */
		emAndamento(): Promise<void> | null {
			return em.andamento;
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
	emitir: (soProgresso) => {
		emit("sigaa-changed", {});
		if (!soProgresso) emit("biblioteca-changed", {});
	},
	compartilhado: compartilhadoGlobal(),
});
