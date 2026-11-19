/** Escopo por avaliação, posições e tópicos com ids estáveis (spec Etapa A
 * §7.2–7.3). Fixture fictícia no formato de um plano de ensino real. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	arquivarRemovidos,
	computeEscopos,
	computePosicoes,
	reconcileTopicos,
	topicosReferenciados,
	type Aula,
	type Avaliacao,
	type Turma,
} from "../src/core/index.ts";

/** "Cálculo Teste": 32 aulas, N1 na 11, N2 na 20, N3 na 30, recuperação no fim. */
function aulas(): Aula[] {
	const faixa: [number, number, string][] = [
		[1, 3, "t1"], [4, 6, "t2"], [7, 10, "t3"],
		[12, 14, "t4"], [15, 17, "t5"], [18, 19, "t6"],
		[21, 24, "t7"], [25, 27, "t8"], [28, 29, "t9"],
	];
	const out: Aula[] = [];
	for (let ordem = 1; ordem <= 32; ordem++) {
		const dia = new Date(2026, 7, 19 + ordem * 3);
		const data = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`;
		const t = faixa.find(([a, b]) => ordem >= a && ordem <= b)?.[2];
		const aula: Aula = { ordem, rotulo: `${ordem * 2 - 1} e ${ordem * 2}`, data, conteudo: t ? `Conteúdo ${t}` : "Outra", topicos: t ? [t] : [] };
		if (ordem === 11) aula.avaliacaoId = "N1";
		if (ordem === 20) aula.avaliacaoId = "N2";
		if (ordem === 30) aula.avaliacaoId = "N3";
		if (ordem >= 31) aula.conteudo = "Atividades de Recuperação";
		out.push(aula);
	}
	return out;
}

const prova = (id: string, extra: Partial<Avaliacao> = {}): Avaliacao => ({ id, nome: id, tipo: "prova-escrita", escopo: { topicos: [] }, ...extra });

describe("computeEscopos", () => {
	const avs = [prova("N1"), prova("N2"), prova("N3"), prova("AVs", { tipo: "substitutiva" }), prova("TF", { tipo: "trabalho" })];

	it("prova regular cobre as aulas desde a prova anterior", () => {
		const { avaliacoes } = computeEscopos(avs, aulas());
		const escopo = (id: string) => avaliacoes.find((a) => a.id === id)!.escopo.topicos;
		assert.deepEqual(escopo("N1"), ["t1", "t2", "t3"]);
		assert.deepEqual(escopo("N2"), ["t4", "t5", "t6"]);
		assert.deepEqual(escopo("N3"), ["t7", "t8", "t9"]);
	});

	it("substitutiva cobre tudo e trabalho fica sem escopo", () => {
		const { avaliacoes } = computeEscopos(avs, aulas());
		assert.deepEqual(avaliacoes.find((a) => a.id === "AVs")!.escopo.topicos, ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"]);
		assert.deepEqual(avaliacoes.find((a) => a.id === "TF")!.escopo.topicos, []);
	});

	it("avaliação sem data e sem aula fica sem escopo e gera aviso (foco 2)", () => {
		const { avaliacoes, avisos } = computeEscopos([...avs, prova("AV9")], aulas());
		assert.deepEqual(avaliacoes.find((a) => a.id === "AV9")!.escopo.topicos, []);
		assert.equal(avisos.length, 1);
		assert.match(avisos[0]!, /AV9/);
		assert.match(avisos[0]!, /defina o escopo à mão/);
		// e não atrapalha o escopo das outras provas
		assert.deepEqual(avaliacoes.find((a) => a.id === "N2")!.escopo.topicos, ["t4", "t5", "t6"]);
	});

	it("avaliação só com data usa a última aula até a data, incluindo a do dia", () => {
		const lista = aulas().map((a) => (a.avaliacaoId === "N2" ? { ...a, avaliacaoId: undefined } : a));
		const dataDaAula15 = lista.find((a) => a.ordem === 15)!.data!;
		const { avaliacoes } = computeEscopos([prova("N1"), prova("P2", { data: dataDaAula15 })], lista);
		assert.deepEqual(avaliacoes.find((a) => a.id === "P2")!.escopo.topicos, ["t4", "t5"]);
	});
});

describe("computePosicoes", () => {
	it("numera as provas regulares pela ordem no cronograma", () => {
		const out = computePosicoes([prova("N3"), prova("N1"), prova("AVs", { tipo: "substitutiva" }), prova("N2"), prova("AV9")], aulas());
		const pos = Object.fromEntries(out.map((a) => [a.id, a.posicao]));
		assert.deepEqual(pos, { N3: 3, N1: 1, AVs: undefined, N2: 2, AV9: undefined });
		assert.deepEqual(out.map((a) => a.id), ["N3", "N1", "AVs", "N2", "AV9"], "a ordem da lista não muda");
	});
});

describe("reconcileTopicos", () => {
	const existentes = [{ id: "limites", titulo: "Limites" }, { id: "regra-da-cadeia", titulo: "Regra da cadeia" }, { id: "velho", titulo: "Velho", arquivado: true }];

	it("cria ids novos por slug e resolve colisões", () => {
		const { topicos, aulas: a, erros } = reconcileTopicos(existentes, [
			{ ref: "limites", titulo: "Limites (novo título ignorado)", existente: true },
			{ ref: "x1", titulo: "Regra da Cadeia", existente: false },
			{ ref: "x2", titulo: "Regra da Cadeia", existente: false },
			{ ref: "x3", titulo: "Taylor", existente: false },
		], [{ topicos: ["limites", "x1"] }, { topicos: ["x2"] }, { topicos: [] }, { topicos: ["x3"] }]);
		assert.deepEqual(erros, []);
		assert.deepEqual(topicos.map((t) => t.id), ["limites", "regra-da-cadeia", "velho", "regra-da-cadeia-2", "regra-da-cadeia-3", "taylor"]);
		assert.equal(topicos[0]!.titulo, "Limites", "o título do existente não muda na importação");
		assert.deepEqual(a, [["limites", "regra-da-cadeia-2"], ["regra-da-cadeia-3"], [], ["taylor"]]);
	});

	it("um existente reaproveitado deixa de estar arquivado", () => {
		const { topicos } = reconcileTopicos(existentes, [{ ref: "velho", titulo: "Velho", existente: true }], [{ topicos: ["velho"] }]);
		assert.equal(topicos.find((t) => t.id === "velho")!.arquivado, undefined);
	});

	it("aponta erro para existente desconhecido e para ref fora da lista", () => {
		const { erros } = reconcileTopicos(existentes, [{ ref: "nao-existe", titulo: "X", existente: true }], [{ topicos: ["nao-existe"] }, { topicos: ["fantasma"] }]);
		assert.equal(erros.length, 2);
		assert.match(erros.join("\n"), /nao-existe/);
		assert.match(erros.join("\n"), /fantasma/);
	});
});

describe("tópicos referenciados e arquivamento", () => {
	const turma = { aulas: [{ topicos: ["t1"] }, { topicos: ["t2"] }], avaliacoes: [{ escopo: { topicos: ["t3"] } }] } as unknown as Turma;

	it("junta tópicos de aulas, escopos e sessões", () => {
		assert.deepEqual([...topicosReferenciados([turma], ["t9"])].sort(), ["t1", "t2", "t3", "t9"]);
	});

	it("o removido referenciado volta arquivado e o não referenciado some", () => {
		const antes = [{ id: "t1", titulo: "Um" }, { id: "t3", titulo: "Três" }, { id: "t4", titulo: "Quatro" }];
		const depois = [{ id: "t1", titulo: "Um renomeado" }];
		const out = arquivarRemovidos(antes, depois, new Set(["t3"]));
		assert.deepEqual(out, [{ id: "t1", titulo: "Um renomeado" }, { id: "t3", titulo: "Três", arquivado: true }]);
	});
});
