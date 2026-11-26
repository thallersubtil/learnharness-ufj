/** Telas enxutas (spec chat+SIGAA §5.6): só o que o aluno usa para estudar. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BibliotecaHome } from "../components/biblioteca/biblioteca-home.tsx";
import { PreparacaoTela } from "../components/biblioteca/preparacao-view.tsx";
import { TurmaView } from "../components/biblioteca/turma-view.tsx";
import { ContaUfj } from "../components/sigaa/conta-ufj.tsx";
import { montarDoSigaa, type EstadoSigaa, type PreparacaoView } from "../src/core/index.ts";
import { materiaValida, turmaValida } from "./helpers/biblioteca-fixtures.ts";

const noop = () => {};

describe("telas enxutas", () => {
	it("a home não tem frase de apoio nem código da matéria; importar o plano é um link discreto no fim", () => {
		const html = renderToStaticMarkup(<BibliotecaHome materias={[{ materia: materiaValida(), turmas: [turmaValida()] }]} problemas={[]} hoje={new Date(2026, 10, 18)} />);
		assert.doesNotMatch(html, /As matérias do semestre, as provas e a preparação de cada uma\./);
		assert.doesNotMatch(html, />ICE0001</);
		assert.match(html, /href="\/biblioteca\/importar"[^>]*>Importar plano de ensino<\/a>\s*<\/(p|div)>\s*<\/div>$/);
	});

	it("a turma do SIGAA mostra docente e semestre, sem 'do SIGAA' solto e com o código pequeno", () => {
		const m = montarDoSigaa(
			{ idTurma: "1001", codigo: "ICE0001", nome: "DISCIPLINA TESTE", semestre: "2026-2", sufixo: "TA", docente: "Prof. Exemplo Teste", topicos: [{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" }], avaliacoes: [], arquivos: [], tarefas: [], noticias: [] },
			{ materia: null, turma: null, referencias: { formato: 1, arquivos: [] } },
			"2026-09-05T12:00:00.000Z",
		);
		const html = renderToStaticMarkup(<TurmaView dados={{ materia: m.materia, turma: m.turma, referencias: m.referencias, arquivos: [] }} hoje={new Date(2026, 8, 5)} onEditar={noop} />);
		assert.match(html, /Prof\. Exemplo Teste · 2026-2/);
		assert.doesNotMatch(html, /· do SIGAA/);
		assert.match(html, /<span[^>]*text-xs[^>]*>ICE0001<\/span>/);
	});

	it("a preparação diz '04/09 · 2 materiais' e '1 material'", () => {
		const topico = (id: string, referencias: number): PreparacaoView["topicos"][number] => ({
			id, titulo: id, aulas: [{ rotulo: "4", data: "2026-09-04" }], referencias, aulaFeita: false, praticado: false, sessoes: [],
			ufjContext: { materia: "ICE0001", turma: "t", avaliacao: "p", topico: id }, promptAprender: "a", promptPraticar: "p",
		});
		const view: PreparacaoView = {
			materia: { codigo: "ICE0001", nome: "Disciplina Teste" }, turma: { id: "t", semestre: "2026-2", docente: "" },
			avaliacao: { id: "p", nome: "2ª unidade", tipo: "prova-escrita", data: "2026-09-10", escopo: { topicos: ["a", "b"] } },
			dias: 5, horas: null, criteriosMedia: "", topicos: [topico("a", 2), topico("b", 1)], passos: [], avisos: [],
			revisao: { ufjContext: { materia: "ICE0001", turma: "t", avaliacao: "p", origem: "prova" }, prompt: "x" }, revisoes: [],
		};
		const html = renderToStaticMarkup(<PreparacaoTela view={view} ocupado={false} onAprender={noop} onPraticar={noop} onHoras={noop} />);
		assert.match(html, /04\/09 · 2 materiais/);
		assert.match(html, /04\/09 · 1 material</);
		assert.doesNotMatch(html, /Aula 4|material\(is\)/);
		assert.doesNotMatch(html, /data-revisoes/, "sem revisão, nada aparece");
		const comRevisao = renderToStaticMarkup(<PreparacaoTela view={{ ...view, revisoes: [{ id: "r1", title: "Quero revisar para a 2ª unidade", kind: "teach", rotulo: "Revisão" }] }} ocupado={false} onAprender={noop} onPraticar={noop} onHoras={noop} />);
		assert.match(comRevisao, /data-revisoes[^>]*>[\s\S]*href="\/chat\/r1"[^>]*>Revisão: Quero revisar para a 2ª unidade</);
	});

	it("a Conta UFJ mostra no máximo 5 avisos e 'e mais N'", () => {
		const estado: EstadoSigaa = { situacao: "ocioso", usuario: "aluno.teste", ultimoSucesso: "2026-11-24T12:00:00.000Z", avisos: Array.from({ length: 7 }, (_, i) => `Aviso ${i + 1}`) };
		const html = renderToStaticMarkup(<ContaUfj estado={estado} ocupado={false} erro={null} onConectar={noop} onSincronizar={noop} onSair={noop} />);
		assert.match(html, /Aviso 5/);
		assert.doesNotMatch(html, /Aviso 6/);
		assert.match(html, /e mais 2/);
	});
});
