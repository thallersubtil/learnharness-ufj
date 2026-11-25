/** Telas da biblioteca UFJ (spec Etapa A §7.1, 7.3–7.5), renderizadas no
 * servidor como os outros testes de tela. Componentes puros; dados fictícios. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BibliotecaHome } from "../components/biblioteca/biblioteca-home.tsx";
import { ehConflitoDeTurma } from "../components/biblioteca/importar-plano.tsx";
import { PlanoForm, comIdentidade } from "../components/biblioteca/plano-form.tsx";
import { PreparacaoTela } from "../components/biblioteca/preparacao-view.tsx";
import { UfjContextCard } from "../components/ufj-context-card.tsx";
import { BibliotecaNavButton } from "../components/sidebar.tsx";
import { materiaValida, turmaValida } from "./helpers/biblioteca-fixtures.ts";
import type { PreparacaoView, TopicoPreparacao } from "../src/core/index.ts";

const noop = () => {};
const turmaComN2 = () => ({
	...turmaValida(),
	avaliacoes: [
		{ id: "N2", nome: "N2 — Avaliação escrita", tipo: "prova-escrita" as const, posicao: 2, data: "2026-12-08", pontos: 10, escopo: { topicos: ["limites"] } },
		{ id: "TF", nome: "Trabalho final", tipo: "trabalho" as const, escopo: { topicos: [] } },
	],
});

describe("BibliotecaHome", () => {
	it("vazia mostra o convite para importar", () => {
		const html = renderToStaticMarkup(<BibliotecaHome materias={[]} problemas={[]} hoje={new Date(2026, 10, 18)} />);
		assert.match(html, /Nenhuma matéria ainda\. Conecte sua conta UFJ ou importe um plano de ensino\./);
		assert.match(html, /href="\/biblioteca\/importar"/);
		assert.match(html, /Importar plano de ensino/);
	});

	it("lista matéria, turma e só as provas, com contagem regressiva", () => {
		const html = renderToStaticMarkup(<BibliotecaHome materias={[{ materia: materiaValida(), turmas: [turmaComN2()] }]} problemas={["ICE0002: formato mais novo que este app"]} hoje={new Date(2026, 10, 18)} />);
		assert.match(html, /href="\/biblioteca\/ICE0001\/2026-2-prof-exemplo\/N2"/);
		assert.match(html, /faltam 20 dias/);
		assert.doesNotMatch(html, /\/biblioteca\/ICE0001\/2026-2-prof-exemplo\/TF/, "trabalho não ganha preparação");
		assert.match(html, /href="\/biblioteca\/ICE0001\/2026-2-prof-exemplo"/);
		assert.match(html, /ICE0002: formato mais novo que este app/);
	});
});

describe("PlanoForm", () => {
	it("mostra os avisos e marca as caixas do escopo", () => {
		const materia = { ...materiaValida(), topicos: [{ id: "limites", titulo: "Limites" }, { id: "derivadas", titulo: "Derivadas" }] };
		const turma = turmaComN2();
		const html = renderToStaticMarkup(<PlanoForm materia={materia} turma={turma} avisos={["A avaliação AV9 não tem data nem aula no cronograma: defina o escopo à mão."]} onChange={noop} />);
		assert.match(html, /AV9 não tem data nem aula/);
		assert.match(html, /data-escopo="N2:limites"[^>]*checked/);
		assert.doesNotMatch(html, /data-escopo="N2:derivadas"[^>]*checked/);
		assert.match(html, /value="Limites"/);
		assert.match(html, /1 e 2/);
	});
});

describe("identificação editável na importação (revisão final, item 3)", () => {
	it("comIdentidade recalcula o slug do docente e o id da turma, e normaliza o código", () => {
		const base = { materia: materiaValida(), turma: turmaValida() };
		const p = comIdentidade(base, { docente: "Profa. Nova Pessoa" });
		assert.deepEqual(p.turma.docente, { nome: "Profa. Nova Pessoa", slug: "profa-nova-pessoa" });
		assert.equal(p.turma.id, "2026-2-profa-nova-pessoa");
		assert.equal(comIdentidade(base, { semestre: "2027-1" }).turma.id, "2027-1-prof-exemplo");
		assert.equal(comIdentidade(base, { codigo: " ice0002 " }).materia.codigo, "ICE0002");
	});

	it("na importação os campos de identificação são editáveis; na edição, não", () => {
		const props = { materia: materiaValida(), turma: turmaValida(), avisos: [], onChange: noop };
		const editavel = renderToStaticMarkup(<PlanoForm {...props} identidadeEditavel />);
		const fixo = renderToStaticMarkup(<PlanoForm {...props} />);
		assert.doesNotMatch(editavel, /value="ICE0001" readOnly|readonly="" value="ICE0001"|value="ICE0001"[^>]*readonly/i);
		assert.match(fixo, /value="ICE0001"[^>]*readonly|readonly=""[^>]*value="ICE0001"/i);
	});
});

function topico(id: string, over: Partial<TopicoPreparacao> = {}): TopicoPreparacao {
	return {
		id, titulo: id.toUpperCase(), aulas: [{ rotulo: "1 e 2", data: "2026-08-19" }], referencias: 1, aulaFeita: false, praticado: false, sessoes: [],
		ufjContext: { materia: "ICE0001", turma: "2026-2-prof-exemplo", avaliacao: "N3", topico: id },
		promptAprender: `Quero entender ${id}`, promptPraticar: `Quero praticar ${id}`, ...over,
	};
}

describe("PreparacaoTela", () => {
	const view: PreparacaoView = {
		materia: { codigo: "ICE0001", nome: "Cálculo Teste" },
		turma: { id: "2026-2-prof-exemplo", semestre: "2026-2", docente: "Prof. Exemplo" },
		avaliacao: { id: "N3", nome: "N3 — Avaliação escrita", tipo: "prova-escrita", data: "2026-12-08", pontos: 10, escopo: { topicos: [] } },
		dias: 20, horas: 6, criteriosMedia: "M=(N1+N2+N3)/3",
		topicos: [topico("a", { aulaFeita: true, sessoes: [{ id: "s1", title: "Aula de A", kind: "teach", rotulo: "Aula" }] }), topico("b", { aulaFeita: true, praticado: true }), topico("c")],
		passos: [{ tipo: "aprender", topico: "c", texto: "Aprender: C" }, { tipo: "praticar", topico: "a", texto: "Praticar: A" }],
		avisos: [],
	};

	it("mostra contagem, selos, próximos passos e os botões", () => {
		const html = renderToStaticMarkup(<PreparacaoTela view={view} onAprender={noop} onPraticar={noop} onHoras={noop} />);
		assert.match(html, /faltam 20 dias/);
		assert.match(html, /08\/12\/2026/);
		assert.match(html, /Prof\. Exemplo/);
		assert.match(html, /Aprender: C/);
		assert.match(html, /Praticar: A/);
		assert.equal((html.match(/data-selo="aula-feita"/g) ?? []).length, 2);
		assert.equal((html.match(/data-selo="praticado"/g) ?? []).length, 1);
		assert.equal((html.match(/>Aprender</g) ?? []).length, 3);
		assert.equal((html.match(/>Praticar</g) ?? []).length, 3);
		assert.match(html, /href="\/chat\/s1"/);
		assert.match(html, /value="6"/);
	});

	it("é hoje e avisos aparecem", () => {
		const html = renderToStaticMarkup(<PreparacaoTela view={{ ...view, dias: 0, avisos: ["Esta avaliação está sem escopo. Edite o plano para escolher os tópicos."] }} onAprender={noop} onPraticar={noop} onHoras={noop} />);
		assert.match(html, /é hoje/);
		assert.match(html, /está sem escopo/);
	});
});

describe("UfjContextCard", () => {
	it("mostra os nomes guardados no marcador, mesmo de um tópico arquivado depois (foco 5)", () => {
		const html = renderToStaticMarkup(<UfjContextCard data={{ materia: "ICE0001", turma: "t", avaliacao: "N3", topico: "velho", materiaNome: "Cálculo Teste", docente: "Prof. Exemplo", avaliacaoNome: "N3 — Avaliação escrita", data: "2026-12-08", topicoTitulo: "Tópico que foi arquivado" }} />);
		assert.match(html, /Contexto UFJ/);
		assert.match(html, /Cálculo Teste · N3 — Avaliação escrita · 08\/12 · Tópico que foi arquivado/);
	});
});

describe("barra lateral", () => {
	it("o botão Matérias aparece", () => {
		const html = renderToStaticMarkup(<BibliotecaNavButton active={false} onClick={noop} />);
		assert.match(html, /Matérias/);
		assert.match(html, /data-testid="nav-biblioteca"/);
	});
});

describe("conflito ao salvar (revisão final, item 4)", () => {
	it("só 409 turma_existe pede para substituir", () => {
		assert.equal(ehConflitoDeTurma(409, { code: "turma_existe" }), true);
		assert.equal(ehConflitoDeTurma(409, { code: "formato_mais_novo" }), false);
		assert.equal(ehConflitoDeTurma(400, { code: "turma_existe" }), false);
	});
});
