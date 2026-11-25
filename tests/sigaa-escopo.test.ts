/** O que cai em cada prova numa turma do SIGAA (spec SIGAA §7.5–7.6): escopo
 * pelas datas, aulas de prova como limite, escolhas à mão que vencem o
 * cálculo, e mudar a data ou adicionar prova. Dados fictícios. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	BibliotecaEntradaError,
	BibliotecaNaoEncontradaError,
	adicionarProva,
	definirDataProva,
	definirEscopoProva,
	recalcularTurma,
	removerProva,
	renomearProva,
	type Turma,
} from "../src/core/index.ts";
import { turmaValida } from "./helpers/biblioteca-fixtures.ts";

function turmaSigaa(): Turma {
	return {
		...turmaValida(),
		id: "2026-2-turma-ta",
		docente: { nome: "", slug: "sigaa" },
		sigaa: { idTurma: "123", sufixo: "TA", sincronizadoEm: "2026-11-24T12:00:00.000Z" },
		aulas: [
			{ ordem: 1, rotulo: "1", data: "2026-09-01", conteudo: "Limites", topicos: ["limites"], sigaa: { titulo: "Limites" } },
			{ ordem: 2, rotulo: "2", data: "2026-09-02", conteudo: "Continuidade", topicos: ["continuidade"], sigaa: { titulo: "Continuidade" } },
			{ ordem: 3, rotulo: "3", data: "2026-09-03", conteudo: "Avaliação da aprendizagem", topicos: [], sigaa: { titulo: "Avaliação da aprendizagem", prova: true } },
			{ ordem: 4, rotulo: "4", data: "2026-09-04", conteudo: "Derivadas", topicos: ["derivadas"], sigaa: { titulo: "Derivadas" } },
			{ ordem: 5, rotulo: "5", data: "2026-09-05", conteudo: "Regra da cadeia", topicos: ["regra-da-cadeia"], sigaa: { titulo: "Regra da cadeia" } },
			{ ordem: 6, rotulo: "6", data: "2026-09-07", conteudo: "Integrais", topicos: ["integrais"], sigaa: { titulo: "Integrais" } },
		],
		avaliacoes: [{ id: "p3", nome: "3ª prova", tipo: "prova-escrita", data: "2026-09-06", origemData: "manual", escopo: { topicos: [] } }],
	};
}

const escopo = (t: Turma, id: string) => t.avaliacoes.find((a) => a.id === id)!.escopo.topicos;

describe("escopo por datas na turma do SIGAA", () => {
	it("a aula de prova é limite: o escopo começa depois dela", () => {
		const t = recalcularTurma(turmaSigaa());
		assert.deepEqual(escopo(t, "p3"), ["derivadas", "regra-da-cadeia"]);
	});

	it("prova na mesma data de uma aula de prova fica na posição dela", () => {
		const base = turmaSigaa();
		base.aulas[2] = { ...base.aulas[2]!, avaliacaoId: "p1" };
		base.avaliacoes.unshift({ id: "p1", nome: "1ª prova", tipo: "prova-escrita", data: "2026-09-03", origemData: "sigaa", escopo: { topicos: [] } });
		const t = recalcularTurma(base);
		assert.deepEqual(escopo(t, "p1"), ["limites", "continuidade"]);
		assert.deepEqual(escopo(t, "p3"), ["derivadas", "regra-da-cadeia"]);
	});

	it("escolhas à mão vencem o cálculo e sobrevivem ao recálculo", () => {
		const t = definirEscopoProva(recalcularTurma(turmaSigaa()), "p3", ["limites", "regra-da-cadeia"]);
		assert.deepEqual(escopo(t, "p3"), ["regra-da-cadeia", "limites"]);
		const av = t.avaliacoes.find((a) => a.id === "p3")!;
		assert.deepEqual(av.escopoManual, { incluidos: ["limites"], excluidos: ["derivadas"] });
		assert.deepEqual(escopo(recalcularTurma(t), "p3"), ["regra-da-cadeia", "limites"]);
	});

	it("mudar a data muda o escopo e marca origem manual", () => {
		const t = definirDataProva(recalcularTurma(turmaSigaa()), "p3", "2026-09-04");
		const av = t.avaliacoes.find((a) => a.id === "p3")!;
		assert.equal(av.data, "2026-09-04");
		assert.equal(av.origemData, "manual");
		assert.deepEqual(av.escopo.topicos, ["derivadas"]);
	});

	it("null apaga a data e a origem", () => {
		const t = definirDataProva(recalcularTurma(turmaSigaa()), "p3", null);
		const av = t.avaliacoes.find((a) => a.id === "p3")!;
		assert.equal(av.data, undefined);
		assert.equal(av.origemData, undefined);
		assert.deepEqual(av.escopo.topicos, []);
	});

	it("prova desconhecida e data inválida dão erro em português", () => {
		assert.throws(() => definirDataProva(turmaSigaa(), "zzz", "2026-09-04"), (e: unknown) => e instanceof BibliotecaNaoEncontradaError && e.message === "Prova não encontrada.");
		assert.throws(() => definirDataProva(turmaSigaa(), "p3", "04/09/2026"), (e: unknown) => e instanceof BibliotecaEntradaError && e.message === "Informe a data no formato AAAA-MM-DD.");
	});

	it("adicionarProva cria 3a-prova e repete com sufixo", () => {
		const sem = { ...turmaSigaa(), avaliacoes: [] };
		const t1 = adicionarProva(sem, { nome: "3ª prova" });
		assert.equal(t1.avaliacoes[0]!.id, "3a-prova");
		assert.equal(t1.avaliacoes[0]!.tipo, "prova-escrita");
		assert.equal(t1.avaliacoes[0]!.origemData, undefined, "sem data, sem origem");
		const t2 = adicionarProva(t1, { nome: "3ª prova", data: "2026-09-06" });
		assert.equal(t2.avaliacoes[1]!.id, "3a-prova-2");
		assert.equal(t2.avaliacoes[1]!.origemData, "manual");
		assert.deepEqual(t2.avaliacoes[1]!.escopo.topicos, ["derivadas", "regra-da-cadeia"]);
		assert.throws(() => adicionarProva(sem, { nome: "  " }), /Dê um nome à prova\./);
	});

	it("prova nova na data de uma aula de prova pega os tópicos antes dela (revisão final, I4)", () => {
		const t = adicionarProva({ ...turmaSigaa(), avaliacoes: [] }, { nome: "1ª prova", data: "2026-09-03" });
		assert.deepEqual(escopo(t, "1a-prova"), ["limites", "continuidade"]);
		assert.equal(t.aulas[2]!.avaliacaoId, "1a-prova");
	});

	it("mudar a data de uma prova ligada desfaz a ligação (revisão final, I4)", () => {
		const base = turmaSigaa();
		base.aulas[2] = { ...base.aulas[2]!, avaliacaoId: "p1" };
		base.avaliacoes = [{ id: "p1", nome: "1ª prova", tipo: "prova-escrita", data: "2026-09-03", escopo: { topicos: [] } }];
		const t = definirDataProva(recalcularTurma(base), "p1", "2026-09-05");
		assert.equal(t.aulas[2]!.avaliacaoId, undefined);
		assert.deepEqual(escopo(t, "p1"), ["derivadas", "regra-da-cadeia"]);
	});

	it("renomear e apagar prova à mão; a do SIGAA não (revisão final, #14)", () => {
		const t = recalcularTurma(turmaSigaa());
		assert.equal(renomearProva(t, "p3", "  3ª prova (prática) ").avaliacoes.find((a) => a.id === "p3")!.nome, "3ª prova (prática)");
		assert.throws(() => renomearProva(t, "p3", " "), /Dê um nome à prova\./);
		assert.equal(removerProva(t, "p3").avaliacoes.length, 0);
		const comSigaa = { ...t, avaliacoes: [...t.avaliacoes, { id: "sigaa-1", nome: "2ª unidade", tipo: "prova-escrita" as const, sigaaId: "1", origemData: "sigaa" as const, data: "2026-09-03", escopo: { topicos: [] } }] };
		assert.throws(() => renomearProva(comSigaa, "sigaa-1", "x"), /vem do SIGAA/);
		assert.throws(() => removerProva(comSigaa, "sigaa-1"), /vem do SIGAA e não pode ser apagada aqui/);
		assert.throws(() => removerProva(t, "zzz"), /Prova não encontrada\./);
	});

	it("apagar uma prova solta a aula de prova ligada a ela", () => {
		const base = turmaSigaa();
		base.aulas[2] = { ...base.aulas[2]!, avaliacaoId: "p1" };
		base.avaliacoes = [{ id: "p1", nome: "1ª prova", tipo: "prova-escrita", data: "2026-09-03", origemData: "manual", escopo: { topicos: [] } }];
		const t = removerProva(recalcularTurma(base), "p1");
		assert.equal(t.aulas[2]!.avaliacaoId, undefined);
	});

	it("turma sem sigaa não é recalculada", () => {
		assert.deepEqual(recalcularTurma(turmaValida()), turmaValida());
	});
});
