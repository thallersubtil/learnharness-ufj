/** Fixtures fictícias da biblioteca UFJ — o repositório é público, então
 * nenhum nome real de professor ou plano entra aqui. */
import type { Materia, Turma } from "../../src/core/index.ts";

export function materiaValida(): Materia {
	return {
		formato: 1,
		codigo: "ICE0001",
		nome: "Disciplina Teste",
		curso: "Bacharelado Teste",
		unidade: "Instituto Teste",
		ementa: "Limites. Derivadas.",
		objetivos: { geral: ["Compreender o cálculo."], especificos: ["Calcular limites."] },
		bibliografia: { basica: ["AUTOR, A. Livro. 2020."], complementar: [], virtual: [] },
		topicos: [
			{ id: "limites", titulo: "Limites" },
			{ id: "derivadas", titulo: "Derivadas", descricao: "Regras de derivação", prompt: "Quero entender derivadas." },
			{ id: "antigo", titulo: "Tópico antigo", arquivado: true },
		],
	};
}

export function turmaValida(): Turma {
	return {
		formato: 1,
		id: "2026-2-prof-exemplo",
		semestre: "2026-2",
		docente: { nome: "Prof. Exemplo", slug: "prof-exemplo" },
		turno: "Noturno",
		chTeorica: 64,
		chPratica: 0,
		aulas: [
			{ ordem: 1, rotulo: "1 e 2", data: "2026-08-19", ch: 2, conteudo: "Limites", topicos: ["limites"] },
			{ ordem: 2, rotulo: "3 e 4", data: "2026-08-25", ch: 2, conteudo: "Avaliação", avaliacaoId: "N1", topicos: [] },
		],
		avaliacoes: [
			{ id: "N1", nome: "N1 — Avaliação escrita", tipo: "prova-escrita", posicao: 1, data: "2026-08-25", pontos: 10, escopo: { topicos: ["limites"] } },
		],
		criteriosMedia: "M=(N1+N2)/2",
		importadoEm: "2026-11-19T00:00:00.000Z",
		revisadoEm: "2026-11-19T00:00:00.000Z",
	};
}
