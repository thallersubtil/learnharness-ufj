/** A aba de materiais e a página do arquivo (spec chat+SIGAA §5.5): lista enxuta
 * por tópico de aula, abrir no app, "Estudar com a IA". Dados fictícios. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArquivoView } from "../components/biblioteca/arquivo-view.tsx";
import { MateriaisLista } from "../components/biblioteca/materiais-lista.tsx";
import { TurmaView } from "../components/biblioteca/turma-view.tsx";
import { montarDoSigaa, tipoDeMaterial, type Referencias } from "../src/core/index.ts";
import { materiaValida } from "./helpers/biblioteca-fixtures.ts";

const noop = () => {};
const SHA = "0".repeat(64);

function dados() {
	const refs: Referencias = {
		formato: 1,
		arquivos: [
			{ arquivo: "regra.pdf", sha256: SHA, topicos: [], sigaaId: "55" },
			{ arquivo: "Exemplos.ipynb.md", sha256: "1".repeat(64), topicos: [], sigaaId: "56" },
			{ arquivo: "ficha.docx", sha256: "2".repeat(64), topicos: [], sigaaId: "57" },
			{ arquivo: "limites.pdf", sha256: "3".repeat(64), topicos: [], sigaaId: "58" },
			{ arquivo: "solto.txt", sha256: "4".repeat(64), topicos: [] },
		],
	};
	const m = montarDoSigaa(
		{
			idTurma: "1001", codigo: "ICE0001", nome: "DISCIPLINA TESTE", semestre: "2026-2", sufixo: "TA",
			topicos: [
				{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" },
				{ titulo: "Regra da cadeia", inicio: "2026-09-04", fim: "2026-09-04", descricao: "" },
			],
			avaliacoes: [{ sigaaId: "999", data: "2026-09-10", descricao: "2ª unidade" }],
			arquivos: [
				{ sigaaId: "55", titulo: "Lista de regra da cadeia", descricao: "", topicoDeAula: "Regra da cadeia" },
				{ sigaaId: "56", titulo: "Exemplos", descricao: "", topicoDeAula: "Regra da cadeia" },
				{ sigaaId: "57", titulo: "Ficha de avaliação", descricao: "", topicoDeAula: "Regra da cadeia" },
				{ sigaaId: "58", titulo: "Aula 1 - Limites", descricao: "", topicoDeAula: "Limites" },
			],
			tarefas: [], noticias: [],
		},
		{ materia: null, turma: null, referencias: refs },
		"2026-09-05T12:00:00.000Z",
	);
	return { materia: m.materia, turma: m.turma, referencias: m.referencias, arquivos: m.referencias.arquivos.map((a) => a.arquivo) };
}

describe("tipoDeMaterial", () => {
	it("classifica pela extensão", () => {
		assert.deepEqual(tipoDeMaterial("a.pdf"), { tipo: "pdf", rotulo: "PDF", abre: true });
		assert.deepEqual(tipoDeMaterial("Exemplos.ipynb.md"), { tipo: "texto", rotulo: "caderno", abre: true, linguagem: undefined });
		assert.deepEqual(tipoDeMaterial("x.py"), { tipo: "texto", rotulo: "código", abre: true, linguagem: "python" });
		assert.deepEqual(tipoDeMaterial("x.docx"), { tipo: "outro", rotulo: "Word", abre: false });
		assert.deepEqual(tipoDeMaterial("x.png"), { tipo: "imagem", rotulo: "imagem", abre: true });
		assert.deepEqual(tipoDeMaterial("x.zip"), { tipo: "outro", rotulo: "zip", abre: false });
	});
});

describe("MateriaisLista", () => {
	const d = dados();
	const html = renderToStaticMarkup(<MateriaisLista codigo="ICE0001" turmaId={d.turma.id} turma={d.turma} referencias={d.referencias} onEstudar={noop} onAdicionar={noop} />);

	it("agrupa por tópico de aula, do mais recente ao mais antigo, com Sem tópico no fim", () => {
		const grupos = [...html.matchAll(/data-grupo="([^"]+)"/g)].map((m) => m[1]);
		assert.deepEqual(grupos, ["2", "1", "sem-topico"]);
		assert.match(html, /04\/09[\s\S]*Regra da cadeia[\s\S]*01\/09[\s\S]*Limites[\s\S]*Sem tópico/);
		assert.match(html, /solto\.txt/);
	});

	it("PDF tem Abrir e Estudar; .docx só Baixar", () => {
		const regra = html.slice(html.indexOf('data-arquivo="regra.pdf"'), html.indexOf('data-arquivo="Exemplos.ipynb.md"'));
		assert.match(regra, /href="\/biblioteca\/ICE0001\/2026-2-turma-ta\/arquivo\/regra\.pdf"/);
		assert.match(regra, />Abrir</);
		assert.match(regra, />Estudar com a IA</);
		assert.match(regra, /· PDF/);
		const ficha = html.slice(html.indexOf('data-arquivo="ficha.docx"'), html.indexOf('data-arquivo="limites.pdf"'));
		assert.match(ficha, />Baixar</);
		assert.match(ficha, /\/api\/biblioteca\/materias\/ICE0001\/turmas\/2026-2-turma-ta\/arquivos\/ficha\.docx/);
		assert.doesNotMatch(ficha, />Abrir<|>Estudar com a IA</);
	});

	it("tem o envio com seletor de tópico", () => {
		assert.match(html, />Adicionar arquivo</);
		assert.match(html, /<option value="limites">Limites<\/option>/);
		assert.match(html, /<option value="regra-da-cadeia">Regra da cadeia<\/option>/);
	});
});

describe("ArquivoView", () => {
	it("PDF usa iframe com a rota", () => {
		const html = renderToStaticMarkup(<ArquivoView titulo="Lista de regra da cadeia" topicoTitulo="Regra da cadeia" tipo="pdf" url="/api/biblioteca/materias/ICE0001/turmas/t/arquivos/regra.pdf" onEstudar={noop} />);
		assert.match(html, /<iframe[^>]*src="\/api\/biblioteca\/materias\/ICE0001\/turmas\/t\/arquivos\/regra\.pdf"/);
		assert.match(html, /Lista de regra da cadeia/);
		assert.match(html, /Regra da cadeia/);
		assert.match(html, />Estudar com a IA</);
	});

	it(".md renderiza markdown e código vai em bloco", () => {
		const md = renderToStaticMarkup(<ArquivoView titulo="Exemplos" tipo="texto" url="/x" texto={"# Exemplos\n\nDerivadas."} onEstudar={noop} />);
		assert.match(md, /<h1[^>]*>Exemplos<\/h1>/);
		const codigo = renderToStaticMarkup(<ArquivoView titulo="jogo.c" tipo="texto" linguagem="c" url="/x" texto={"int main() {}"} onEstudar={noop} />);
		assert.match(codigo, /int main\(\) \{\}/);
		assert.match(codigo, /<pre|<code/);
	});

	it("imagem usa img", () => {
		const html = renderToStaticMarkup(<ArquivoView titulo="figura.png" tipo="imagem" url="/img" onEstudar={noop} />);
		assert.match(html, /<img[^>]*src="\/img"/);
	});
});

describe("turma do SIGAA com a aba de materiais", () => {
	it("mostra a lista de materiais e os tópicos de aula não repetem os arquivos", () => {
		const d = dados();
		const html = renderToStaticMarkup(<TurmaView dados={d} hoje={new Date(2026, 8, 5)} onEditar={noop} acoes={{ onData: noop, onAdicionar: noop, onEscopo: noop, onRenomear: noop, onApagar: noop }} materiais={{ onEstudar: noop, onAdicionar: noop }} />);
		assert.match(html, /Materiais/);
		assert.equal(html.match(/Lista de regra da cadeia/g)?.length, 1, "aparece uma vez: na lista de materiais");
		assert.match(html, /data-aula="2"/);
	});
});
