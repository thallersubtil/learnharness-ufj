// Adaptado de sigaa-mcp (https://github.com/Pedromaia0/sigaa-mcp). Copyright (c) 2026 Pedro Maia. Licença MIT.
/**
 * LER O SIGAA INTEIRO (spec SIGAA §7.3): para cada turma do portal, abre a
 * turma, lê a página principal e as seções desta fatia (Avaliações e
 * Arquivos), e baixa os arquivos que o app ainda não tem. Cada seção é aberta
 * a partir da página principal da turma. Seções com dados de colegas e notas
 * nunca são abertas. Um erro numa turma não derruba as outras; a sessão que
 * cai interrompe a leitura, sem novo login.
 */

import { normalizarTitulo, type ProgressoLeitura, type SigaaTurmaLida } from "../../core/sigaa.ts";
import { SigaaCanceladaError, SigaaEstruturaError, SigaaSessaoExpiradaError } from "./erros.ts";
import type { Pagina, SigaaSessao } from "./http.ts";
import { ipynbParaTexto } from "./ipynb.ts";
import { clicar } from "./jsf.ts";
import { lerArquivos, type ArquivoNaLista } from "./ler-arquivos.ts";
import { lerAvaliacoes } from "./ler-avaliacoes.ts";
import { lerPortal, type TurmaNoPortal } from "./ler-portal.ts";
import { lerCabecalho, lerDocente, lerMenu, lerTopicos, type ItemDeMenu } from "./ler-turma.ts";
import { PORTAL, ehTelaDeLogin } from "./login.ts";

export { ipynbParaTexto } from "./ipynb.ts";

export const SECOES_LIDAS = ["Avaliações", "Arquivos"] as const;

export const SECOES_PROIBIDAS: readonly string[] = [
	"Participantes",
	"Ver Notas",
	"Frequência",
	"Fóruns",
	"Chats Agendados",
	"Enquetes",
	"Questionários",
	"Situação dos Discentes",
	"Estatísticas de Notas",
	"Gerenciar Perfil",
	"Twitter",
	"Ver Grupo",
];
const PROIBIDAS = new Set(SECOES_PROIBIDAS.map(normalizarTitulo));

export function podeLerSecao(rotulo: string): boolean {
	return !PROIBIDAS.has(normalizarTitulo(rotulo));
}

export interface ArquivoBaixado {
	sigaaId: string;
	nome: string;
	bytes: Uint8Array;
}

export interface LeituraDoSigaa {
	/** Quantas turmas o portal mostrou (0: o portal veio sem a lista). */
	turmasNoPortal: number;
	turmasLidas: number;
	falhas: { idTurma: string; nome: string; erro: string }[];
}

export interface OpcoesLeitura {
	jaBaixado: (lida: Pick<SigaaTurmaLida, "codigo" | "semestre" | "sufixo">, sigaaId: string) => boolean;
	/** Chamada (síncrona) ao fim de cada turma, com os arquivos novos dela; quem grava é o chamador. */
	aoLerTurma: (lida: SigaaTurmaLida, baixados: ArquivoBaixado[]) => void;
	/** Chamada a cada turma e a cada arquivo baixado, para a barra de progresso. */
	progresso?: (p: ProgressoLeitura) => void;
	/** Verdadeiro quando o aluno saiu da conta: a leitura para na próxima turma ou arquivo, sem gravar. */
	parar?: () => boolean;
}

/** O nome do arquivo no Content-Disposition, seguro para gravar. */
export function nomeDoArquivo(disposicao: string, reserva: string): string {
	let nome = /filename\*=UTF-8''([^;]+)/i.exec(disposicao)?.[1];
	if (nome) {
		try {
			nome = decodeURIComponent(nome);
		} catch {
			/* fica como veio */
		}
	} else {
		nome = /filename="?([^";]+)"?/i.exec(disposicao)?.[1];
		// UTF-8 lido como ISO-8859-1 ("avaliaÃ§Ã£o") volta a ser UTF-8.
		if (nome && /[ÃÂ][\u0080-¿]/.test(nome)) nome = Buffer.from(nome, "latin1").toString("utf8");
	}
	const limpo = (nome ?? reserva).replace(/[/\\\0]/g, "_").replace(/^[.\s]+/, "").trim();
	return cortarPorBytes(limpo || "arquivo", 200);
}

/** Corta o nome para caber em `max` bytes UTF-8 (o disco conta bytes, não letras), mantendo a extensão. */
function cortarPorBytes(nome: string, max: number): string {
	if (Buffer.byteLength(nome, "utf8") <= max) return nome;
	const i = nome.lastIndexOf(".");
	const ext = i > 0 && nome.length - i <= 12 ? nome.slice(i) : "";
	const letras = Array.from(ext ? nome.slice(0, i) : nome);
	while (letras.length > 0 && Buffer.byteLength(letras.join("") + ext, "utf8") > max) letras.pop();
	return `${letras.join("").trim()}${ext}`;
}

const ehArquivo = (p: Pagina) => /filename/i.test(p.headers.get("content-disposition") ?? "");

function checarSessao(p: Pagina): Pagina {
	if (ehTelaDeLogin(p)) throw new SigaaSessaoExpiradaError();
	return p;
}

async function abrirTurma(sessao: SigaaSessao, portal: Pagina, idTurma: string): Promise<Pagina> {
	const t = lerPortal(portal.html).find((x) => x.idTurma === idTurma);
	if (!t) throw new SigaaEstruturaError("a turma sumiu do portal");
	return checarSessao(await clicar(sessao, portal, t.link));
}

async function abrirSecao(sessao: SigaaSessao, principal: Pagina, menu: ItemDeMenu[], rotulo: string): Promise<Pagina | null> {
	const item = menu.find((i) => normalizarTitulo(i.rotulo) === normalizarTitulo(rotulo));
	if (!item || !podeLerSecao(item.rotulo)) return null;
	const pagina = checarSessao(await clicar(sessao, principal, item.link));
	if (pagina.status >= 400) throw new SigaaEstruturaError(`seção ${rotulo}`);
	return pagina;
}

async function lerTurma(sessao: SigaaSessao, portal: Pagina, t: TurmaNoPortal, opcoes: OpcoesLeitura, avisos: string[], onde: Pick<ProgressoLeitura, "turma" | "turmaAtual" | "totalTurmas">): Promise<void> {
	const principal = await abrirTurma(sessao, portal, t.idTurma);
	const cab = lerCabecalho(principal.html);
	const menu = lerMenu(principal.html);
	const secAvaliacoes = await abrirSecao(sessao, principal, menu, "Avaliações");
	let secArquivos = await abrirSecao(sessao, principal, menu, "Arquivos");
	const lista: ArquivoNaLista[] = secArquivos ? lerArquivos(secArquivos.html) : [];

	const baixados: ArquivoBaixado[] = [];
	const novos = lista.filter((arq) => !opcoes.jaBaixado(cab, arq.sigaaId));
	for (const [k, arq] of novos.entries()) {
		if (opcoes.parar?.()) throw new SigaaCanceladaError();
		opcoes.progresso?.({ ...onde, etapa: "arquivos", arquivoAtual: k + 1, totalArquivos: novos.length });
		let link = arq.link;
		let r = checarSessao(await clicar(sessao, secArquivos!, link));
		if (!ehArquivo(r)) {
			// A página da lista pode ter expirado depois de um download: reabre e tenta de novo, uma vez.
			const portalNovo = checarSessao(await sessao.get(PORTAL));
			const principalNovo = await abrirTurma(sessao, portalNovo, t.idTurma);
			secArquivos = (await abrirSecao(sessao, principalNovo, lerMenu(principalNovo.html), "Arquivos")) ?? secArquivos;
			link = lerArquivos(secArquivos!.html).find((x) => x.sigaaId === arq.sigaaId)?.link ?? link;
			r = checarSessao(await clicar(sessao, secArquivos!, link));
		}
		if (!ehArquivo(r)) {
			avisos.push(`Não consegui baixar "${arq.titulo}".`);
			continue;
		}
		const nome = nomeDoArquivo(r.headers.get("content-disposition") ?? "", arq.titulo);
		if (nome.toLowerCase().endsWith(".ipynb")) {
			baixados.push({ sigaaId: arq.sigaaId, nome: `${nome}.md`, bytes: new TextEncoder().encode(ipynbParaTexto(new TextDecoder().decode(r.bytes))) });
		} else baixados.push({ sigaaId: arq.sigaaId, nome, bytes: r.bytes });
	}

	const docente = lerDocente(principal.html);
	const lida: SigaaTurmaLida = {
		idTurma: t.idTurma,
		codigo: cab.codigo,
		nome: cab.nome,
		semestre: cab.semestre,
		...(cab.sufixo ? { sufixo: cab.sufixo } : {}),
		...(docente ? { docente } : {}),
		topicos: lerTopicos(principal.html),
		avaliacoes: secAvaliacoes ? lerAvaliacoes(secAvaliacoes.html) : [],
		arquivos: lista.map(({ link: _l, ...a }) => a),
	};
	if (opcoes.parar?.()) throw new SigaaCanceladaError();
	opcoes.aoLerTurma(lida, baixados);
}

export async function lerSigaa(sessao: SigaaSessao, portal: Pagina, opcoes: OpcoesLeitura): Promise<LeituraDoSigaa> {
	const turmas = lerPortal(portal.html);
	const falhas: LeituraDoSigaa["falhas"] = [];
	let turmasLidas = 0;
	let atual = portal;
	for (const [i, t] of turmas.entries()) {
		if (opcoes.parar?.()) break;
		const onde = { turma: t.nome, turmaAtual: i + 1, totalTurmas: turmas.length };
		opcoes.progresso?.({ ...onde, etapa: "turma" });
		const avisos: string[] = [];
		try {
			// Portal novo a cada turma: o ViewState muda depois de abrir a anterior.
			if (i > 0) atual = checarSessao(await sessao.get(PORTAL));
			await lerTurma(sessao, atual, t, opcoes, avisos, onde);
			turmasLidas++;
		} catch (err) {
			if (err instanceof SigaaCanceladaError) break;
			falhas.push({ idTurma: t.idTurma, nome: t.nome, erro: err instanceof Error ? err.message : String(err) });
			if (err instanceof SigaaSessaoExpiradaError) break;
		}
		for (const erro of avisos) falhas.push({ idTurma: t.idTurma, nome: t.nome, erro });
	}
	return { turmasNoPortal: turmas.length, turmasLidas, falhas };
}
