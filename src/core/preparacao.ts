/**
 * A TELA DE PREPARAÇÃO (spec Etapa A §7.5): contagem regressiva, sinais por
 * tópico e próximos passos — tudo determinístico e tirado das próprias
 * sessões. Nada aqui é uma "nota de domínio": "aula feita" e "praticado" só
 * registram que as sessões aconteceram.
 */

import type { Avaliacao } from "./biblioteca.ts";
import type { ChatKind, ChatSummary, UfjContextRef } from "./contracts/chat.ts";

/** Dias de calendário entre hoje e a data AAAA-MM-DD, contados pela DATA LOCAL
 *  (new Date("AAAA-MM-DD") seria meia-noite UTC — 21h do dia anterior no Brasil). */
export function diasAte(data: string, hoje: Date): number {
	const [y, m, d] = data.split("-").map(Number) as [number, number, number];
	const alvo = new Date(y, m - 1, d).getTime();
	const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
	return Math.round((alvo - base) / 86_400_000);
}

export interface SessaoDoTopico {
	id: string;
	title: string;
	kind: ChatKind;
	/** "Aula" | "Prática" | "Material" | "Revisão" — o que a lista mostra. */
	rotulo: string;
}

export interface SinaisDoTopico {
	aulaFeita: boolean;
	praticado: boolean;
	sessoes: SessaoDoTopico[];
}

/** As sessões "Revisar para a prova" desta avaliação (spec chat+SIGAA §5.4), da mais recente para a mais antiga. */
export function revisoesDaProva(chats: readonly ChatSummary[], ref: { materia: string; avaliacao: string }): SessaoDoTopico[] {
	return chats
		.filter((c) => c.ufj?.origem === "prova" && c.ufj.materia === ref.materia && c.ufj.avaliacao === ref.avaliacao)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.map((c) => ({ id: c.id, title: c.title, kind: c.kind, rotulo: "Revisão" }));
}

/** Sinais por id de tópico, das sessões criadas pela biblioteca nesta matéria
 *  (os tópicos são da matéria, então valem sessões de qualquer turma). */
export function sinaisPorTopico(chats: readonly ChatSummary[], ref: { materia: string }): Map<string, SinaisDoTopico> {
	const out = new Map<string, SinaisDoTopico>();
	for (const c of chats) {
		const topico = c.ufj?.topico;
		if (!topico || c.ufj?.materia !== ref.materia) continue;
		const s = out.get(topico) ?? { aulaFeita: false, praticado: false, sessoes: [] };
		// Só a sessão DO TÓPICO conta como aula feita / praticado (spec chat+SIGAA
		// §5.4): estudar um slide ou revisar a prova não marca o tópico como dado.
		const doTopico = !c.ufj?.origem || c.ufj.origem === "topico";
		if (doTopico && c.kind === "teach" && c.phase === "teach") s.aulaFeita = true;
		if (doTopico && c.kind === "practice" && c.concludedProblems >= 1) s.praticado = true;
		const rotulo = c.ufj?.origem === "material" ? "Material" : c.ufj?.origem === "prova" ? "Revisão" : c.kind === "practice" ? "Prática" : "Aula";
		s.sessoes.push({ id: c.id, title: c.title, kind: c.kind, rotulo });
		out.set(topico, s);
	}
	return out;
}

export interface TopicoPreparacao {
	id: string;
	titulo: string;
	aulas: { rotulo: string; data?: string }[];
	/** Quantos materiais da turma estão ligados a este tópico. */
	referencias: number;
	aulaFeita: boolean;
	praticado: boolean;
	sessoes: SessaoDoTopico[];
	ufjContext: UfjContextRef;
	promptAprender: string;
	promptPraticar: string;
}

export interface Passo {
	tipo: "aprender" | "praticar";
	topico: string;
	texto: string;
}

export const MAX_PASSOS = 5;

/** Próximos passos (regras 2 e 3 da spec; as regras de prova entram nas fatias 2–3):
 *  primeiro aprender o que ainda não teve aula, depois praticar o que já teve,
 *  na ordem do cronograma, no máximo 5. */
export function proximosPassos(topicos: readonly TopicoPreparacao[]): Passo[] {
	const aprender = topicos.filter((t) => !t.aulaFeita).map((t): Passo => ({ tipo: "aprender", topico: t.id, texto: `Aprender: ${t.titulo}` }));
	const praticar = topicos.filter((t) => t.aulaFeita && !t.praticado).map((t): Passo => ({ tipo: "praticar", topico: t.id, texto: `Praticar: ${t.titulo}` }));
	return [...aprender, ...praticar].slice(0, MAX_PASSOS);
}

export interface PreparacaoView {
	materia: { codigo: string; nome: string };
	turma: { id: string; semestre: string; docente: string };
	avaliacao: Avaliacao;
	/** null quando a avaliação não tem data. */
	dias: number | null;
	horas: number | null;
	criteriosMedia: string;
	topicos: TopicoPreparacao[];
	passos: Passo[];
	avisos: string[];
	/** "Revisar para a prova" (spec chat+SIGAA §5.4): o vínculo da prova inteira e a mensagem pré-preenchida. */
	revisao: { ufjContext: UfjContextRef; prompt: string };
	/** As sessões de revisão já abertas para esta prova. */
	revisoes: SessaoDoTopico[];
}
