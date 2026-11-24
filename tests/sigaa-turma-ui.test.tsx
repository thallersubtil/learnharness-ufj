/** A turma do SIGAA na tela (spec SIGAA §7.5–7.7): provas com data editável e
 * selo de origem, conteúdo da prova e tópicos de aula com os arquivos.
 * Renderizadas no servidor; dados fictícios. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DataEditavel } from "../components/biblioteca/data-editavel.tsx";
import { TurmaView } from "../components/biblioteca/turma-view.tsx";
import { PreparacaoTela, tituloPreparacao } from "../components/biblioteca/preparacao-view.tsx";
import { VoltarParaMaterias } from "../components/biblioteca/comum.tsx";
import { montarDoSigaa, type PreparacaoView, type Referencias } from "../src/core/index.ts";
import { materiaValida, turmaValida } from "./helpers/biblioteca-fixtures.ts";

const noop = () => {};
const SHA = "0".repeat(64);

function dadosSigaa() {
	const refs: Referencias = { formato: 1, arquivos: [{ arquivo: "regra.pdf", sha256: SHA, topicos: [], sigaaId: "55" }] };
	const m = montarDoSigaa(
		{
			idTurma: "1001", codigo: "ICE0001", nome: "DISCIPLINA TESTE", semestre: "2026-2", sufixo: "TA",
			topicos: [
				{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" },
				{ titulo: "Não Haverá Aula", inicio: "2026-09-02", descricao: "Falta de energia." },
				{ titulo: "Avaliação da aprendizagem", inicio: "2026-09-03", fim: "2026-09-03", descricao: "" },
				{ titulo: "Regra da cadeia", inicio: "2026-09-04", fim: "2026-09-04", descricao: "" },
			],
			avaliacoes: [{ sigaaId: "999", data: "2026-09-10", descricao: "2ª unidade" }],
			arquivos: [{ sigaaId: "55", titulo: "Slides da regra da cadeia", descricao: "", topicoDeAula: "Regra da cadeia" }],
		},
		{ materia: null, turma: null, referencias: refs },
		"2026-09-01T12:00:00.000Z",
	);
	return { materia: m.materia, turma: m.turma, referencias: m.referencias, arquivos: ["regra.pdf"] };
}

const acoes = { onData: noop, onAdicionar: noop, onEscopo: noop };

describe("DataEditavel", () => {
	it("selo e aviso da data do SIGAA", () => {
		const fechada = renderToStaticMarkup(<DataEditavel data="2026-09-10" origem="sigaa" onSalvar={noop} />);
		assert.match(fechada, /10\/09\/2026/);
		assert.match(fechada, /do SIGAA/);
		const aberta = renderToStaticMarkup(<DataEditavel data="2026-09-10" origem="sigaa" onSalvar={noop} editandoInicial />);
		assert.match(aberta, /type="date"/);
		assert.match(aberta, /value="2026-09-10"/);
		assert.match(aberta, /A próxima sincronização com o SIGAA troca esta data\./);
		assert.match(aberta, />Limpar</);
	});

	it("à mão, do plano e sem data", () => {
		assert.match(renderToStaticMarkup(<DataEditavel data="2026-09-10" origem="manual" onSalvar={noop} />), /à mão/);
		assert.match(renderToStaticMarkup(<DataEditavel data="2026-09-10" origem="plano" onSalvar={noop} />), /do plano/);
		const sem = renderToStaticMarkup(<DataEditavel onSalvar={noop} editandoInicial />);
		assert.match(renderToStaticMarkup(<DataEditavel onSalvar={noop} />), /sem data/);
		assert.doesNotMatch(sem, /A próxima sincronização/);
	});
});

describe("turma do SIGAA", () => {
	it("turma do SIGAA esconde Editar plano e mostra tópicos de aula com arquivos", () => {
		const html = renderToStaticMarkup(<TurmaView dados={dadosSigaa()} hoje={new Date(2026, 8, 5)} onEditar={noop} acoes={acoes} />);
		assert.doesNotMatch(html, /Editar plano/);
		assert.match(html, /Tópicos de aula/);
		assert.match(html, /Regra da cadeia/);
		assert.match(html, /Slides da regra da cadeia/);
		assert.match(html, /2ª unidade/);
		assert.match(html, /do SIGAA/);
		assert.match(html, /href="\/biblioteca\/ICE0001\/2026-2-turma-ta\/sigaa-999"/);
		assert.match(html, /Adicionar prova/);
	});

	it("aula cancelada aparece esmaecida com 'não houve aula'", () => {
		const html = renderToStaticMarkup(<TurmaView dados={dadosSigaa()} hoje={new Date(2026, 8, 5)} onEditar={noop} acoes={acoes} />);
		assert.match(html, /data-aula="2"[^>]*data-cancelada="true"/);
		assert.match(html, /não houve aula/);
		assert.match(html, /data-aula="3"[^>]*data-prova="true"/);
	});

	it("conteúdo da prova marca as caixas do escopo", () => {
		const html = renderToStaticMarkup(<TurmaView dados={dadosSigaa()} hoje={new Date(2026, 8, 5)} onEditar={noop} acoes={acoes} />);
		assert.match(html, /Conteúdo da prova/);
		assert.match(html, /<input[^>]*data-escopo="sigaa-999:regra-da-cadeia"[^>]*checked=""/);
		assert.doesNotMatch(html, /<input[^>]*data-escopo="sigaa-999:limites"[^>]*checked=""/);
	});

	it("turma de plano continua com Editar plano", () => {
		const html = renderToStaticMarkup(<TurmaView dados={{ materia: materiaValida(), turma: turmaValida(), referencias: { formato: 1, arquivos: [] }, arquivos: [] }} hoje={new Date(2026, 10, 18)} onEditar={noop} />);
		assert.match(html, /Editar plano/);
		assert.doesNotMatch(html, /Tópicos de aula/);
	});
});

describe("preparação com data editável", () => {
	it("o cabeçalho usa a data editável e não mostra docente vazio", () => {
		const view: PreparacaoView = {
			materia: { codigo: "ICE0001", nome: "Disciplina Teste" },
			turma: { id: "2026-2-turma-ta", semestre: "2026-2", docente: "" },
			avaliacao: { id: "sigaa-999", nome: "2ª unidade", tipo: "prova-escrita", data: "2026-09-10", origemData: "sigaa", escopo: { topicos: [] } },
			dias: 5, horas: null, criteriosMedia: "", topicos: [], passos: [], avisos: [],
		};
		const html = renderToStaticMarkup(<PreparacaoTela view={view} ocupado={false} onAprender={noop} onPraticar={noop} onHoras={noop} onData={noop} />);
		assert.match(html, /do SIGAA/);
		assert.match(html, /Disciplina Teste/);
		assert.doesNotMatch(html, /Disciplina Teste · </);
	});
});

describe("nomes nas telas (verificação no navegador)", () => {
	it("o título da preparação usa o nome da prova, não o id", () => {
		const view = { avaliacao: { id: "sigaa-7001", nome: "2ª unidade" } } as unknown as PreparacaoView;
		assert.equal(tituloPreparacao(view), "Preparação · 2ª unidade");
		assert.equal(tituloPreparacao(null), "Preparação");
	});

	it("o link de volta diz Matérias", () => {
		const html = renderToStaticMarkup(<VoltarParaMaterias />);
		assert.match(html, /href="\/biblioteca"/);
		assert.match(html, />Matérias</);
	});
});
