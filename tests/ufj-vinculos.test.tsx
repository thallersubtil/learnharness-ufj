/** Vínculos de sessão com origem: tópico (como antes), material e prova inteira
 * (spec chat+SIGAA §5.4). LH_DATA_DIR isolado; dados fictícios. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-ufj-vinculos-"));
process.env.LH_DATA_DIR = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const core = await import("../src/core/index.ts");
const { parseUfjContextRef, ufjMarkerFor } = await import("../src/server/preparacao.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { estudoStore } = await import("../src/store/estudo.ts");
const { UfjContextCard } = await import("../components/ufj-context-card.tsx");
const { materiaValida } = await import("./helpers/biblioteca-fixtures.ts");
type ChatSummary = import("../src/core/index.ts").ChatSummary;

const TURMA = "2026-2-turma-ta";
const SHA = "0".repeat(64);
const deps = () => ({ biblioteca: bibliotecaStore, estudo: estudoStore, listChats: () => [], readNodes: () => [], diasAte: () => 8 });

before(() => {
	const m = core.montarDoSigaa(
		{
			idTurma: "1001", codigo: "ICE0001", nome: "CÁLCULO TESTE", semestre: "2026-2", sufixo: "TA",
			topicos: [
				{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" },
				{ titulo: "Regra da cadeia", inicio: "2026-09-04", fim: "2026-09-04", descricao: "" },
			],
			avaliacoes: [{ sigaaId: "999", data: "2026-12-03", descricao: "2ª unidade" }],
			arquivos: [{ sigaaId: "55", titulo: "Lista de regra da cadeia", descricao: "", topicoDeAula: "Regra da cadeia" }, { sigaaId: "56", titulo: "Aula 1", descricao: "", topicoDeAula: "Limites" }],
			tarefas: [], noticias: [],
		},
		{ materia: { ...materiaValida(), codigo: "ICE0001", nome: "Cálculo Teste" }, turma: null, referencias: { formato: 1, arquivos: [{ arquivo: "regra.pdf", sha256: SHA, topicos: [], sigaaId: "55" }, { arquivo: "aula1.pdf", sha256: "1".repeat(64), topicos: [], sigaaId: "56" }] } },
		"2026-09-05T12:00:00.000Z",
	);
	bibliotecaStore.writeMateria(m.materia);
	bibliotecaStore.writeTurma("ICE0001", m.turma);
	bibliotecaStore.writeReferencias("ICE0001", TURMA, m.referencias);
});

describe("vínculos de sessão", () => {
	it("parse aceita origem, arquivo e avaliação opcional; recusa origem desconhecida", () => {
		assert.deepEqual(parseUfjContextRef({ materia: "ICE0001", turma: TURMA, origem: "material", arquivo: "regra.pdf" }), { materia: "ICE0001", turma: TURMA, origem: "material", arquivo: "regra.pdf" });
		assert.deepEqual(parseUfjContextRef({ materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-999", origem: "prova" }), { materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-999", origem: "prova" });
		assert.throws(() => parseUfjContextRef({ materia: "ICE0001", turma: TURMA, origem: "chute" }), /desconhecid/);
		assert.throws(() => parseUfjContextRef({ materia: "ICE0001", turma: TURMA }), /desconhecid/, "sem avaliação e sem material, não é vínculo nenhum");
	});

	it("marcador de material lista o arquivo primeiro e não exige avaliação", () => {
		const m = ufjMarkerFor({ materia: "ICE0001", turma: TURMA, origem: "material", arquivo: "regra.pdf" }, deps());
		const texto = m.content as string;
		assert.match(texto, /^\[Contexto UFJ\]/);
		assert.doesNotMatch(texto, /^Avaliação:/m);
		assert.match(texto, /Material escolhido pelo aluno: `[^`]*regra\.pdf` — Lista de regra da cadeia/);
		assert.match(texto, /Tópico: Regra da cadeia/);
		const p = m.details as { origem?: string; arquivo?: string; arquivoTitulo?: string; avaliacaoNome?: string; topico?: string };
		assert.equal(p.origem, "material");
		assert.equal(p.arquivo, "regra.pdf");
		assert.equal(p.arquivoTitulo, "Lista de regra da cadeia");
		assert.equal(p.avaliacaoNome, undefined);
		assert.equal(p.topico, "regra-da-cadeia");
	});

	it("marcador de prova traz todos os tópicos do escopo e seus arquivos", () => {
		const m = ufjMarkerFor({ materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-999", origem: "prova" }, deps());
		const texto = m.content as string;
		assert.match(texto, /^Avaliação: 2ª unidade — 03\/12\/2026 \(faltam 8 dias\)\.$/m);
		assert.match(texto, /^Tópicos que caem nesta avaliação:\n- Limites \(aulas 01\/09\)\n- Regra da cadeia \(aulas 04\/09\)$/m);
		assert.match(texto, /regra\.pdf/);
		assert.match(texto, /aula1\.pdf/);
		const p = m.details as { origem?: string; topico?: string; avaliacaoNome?: string };
		assert.equal(p.origem, "prova");
		assert.equal(p.topico, undefined);
		assert.equal(p.avaliacaoNome, "2ª unidade");
	});

	it("arquivo que não existe dá erro 'Material não encontrado.'", () => {
		assert.throws(() => ufjMarkerFor({ materia: "ICE0001", turma: TURMA, origem: "material", arquivo: "nada.pdf" }, deps()), /Material não encontrado\./);
	});

	it("prompts de material e revisão", () => {
		const base = { materia: "ICE0001", turma: TURMA, materiaNome: "Cálculo Teste", docente: "" };
		assert.equal(core.promptMaterial({ ...base, origem: "material", arquivo: "regra.pdf", arquivoTitulo: "Lista de regra da cadeia" }), 'Quero estudar o material "Lista de regra da cadeia" de Cálculo Teste.');
		assert.equal(core.promptRevisao({ ...base, avaliacao: "sigaa-999", origem: "prova", avaliacaoNome: "2ª unidade", data: "2026-12-03" }), "Quero revisar para a 2ª unidade de Cálculo Teste (03/12).");
	});

	it("chat de material/revisão não marca aula feita; chat de tópico marca", () => {
		const sessao = (over: Partial<ChatSummary>): ChatSummary => ({ id: "x", title: "t", createdAt: "2026-11-20T00:00:00.000Z", updatedAt: "2026-11-20T00:00:00.000Z", kind: "teach", phase: "teach", hasActiveProblem: false, concludedProblems: 0, ...over }) as ChatSummary;
		const lista = [
			sessao({ id: "a", ufj: { materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-999", topico: "limites" } }),
			sessao({ id: "b", ufj: { materia: "ICE0001", turma: TURMA, topico: "regra-da-cadeia", origem: "material", arquivo: "regra.pdf" } }),
			sessao({ id: "c", createdAt: "2026-11-21T00:00:00.000Z", ufj: { materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-999", origem: "prova" } }),
			sessao({ id: "d", createdAt: "2026-11-22T00:00:00.000Z", ufj: { materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-999", origem: "prova" } }),
			sessao({ id: "e", ufj: { materia: "ICE0001", turma: TURMA, avaliacao: "sigaa-998", origem: "prova" } }),
		];
		const sinais = core.sinaisPorTopico(lista, { materia: "ICE0001" });
		assert.equal(sinais.get("limites")!.aulaFeita, true);
		assert.equal(sinais.get("regra-da-cadeia")!.aulaFeita, false);
		assert.deepEqual(sinais.get("regra-da-cadeia")!.sessoes.map((s) => [s.id, s.rotulo]), [["b", "Material"]]);
		assert.equal([...sinais.values()].some((s) => s.sessoes.some((x) => x.id === "c")), false, "a revisão da prova não entra em tópico nenhum");
		assert.deepEqual(core.revisoesDaProva(lista, { materia: "ICE0001", avaliacao: "sigaa-999" }).map((s) => [s.id, s.rotulo]), [["d", "Revisão"], ["c", "Revisão"]], "as revisões ficam na prova, da mais recente");
	});

	it("cartão sem avaliação mostra só matéria e material", () => {
		const html = renderToStaticMarkup(<UfjContextCard data={{ materia: "ICE0001", turma: TURMA, origem: "material", arquivo: "regra.pdf", arquivoTitulo: "Lista de regra da cadeia", materiaNome: "Cálculo Teste", docente: "" }} />);
		assert.match(html, /Cálculo Teste · Lista de regra da cadeia/);
		assert.doesNotMatch(html, /undefined/);
	});
});
