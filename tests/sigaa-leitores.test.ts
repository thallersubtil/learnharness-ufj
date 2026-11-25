/** Leitores das páginas do SIGAA (spec SIGAA §6, §7.3): funções puras sobre as
 * páginas de exemplo de tests/fixtures/sigaa (estrutura real, texto inventado). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { lerPortal } from "../src/server/sigaa/ler-portal.ts";
import { lerCabecalho, lerDocente, lerMenu, lerTopicos } from "../src/server/sigaa/ler-turma.ts";
import { lerAvaliacoes } from "../src/server/sigaa/ler-avaliacoes.ts";
import { lerArquivos } from "../src/server/sigaa/ler-arquivos.ts";
import { SigaaEstruturaError } from "../src/server/sigaa/erros.ts";

/** A página como o SIGAA a serve (ISO-8859-1) e como a sessão a decodifica. */
function pagina(nome: string): string {
	const texto = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "sigaa", nome), "utf8").split("{{VIEWSTATE}}").join("j_id1");
	return new TextDecoder("windows-1252").decode(Buffer.from(texto, "latin1"));
}

describe("portal", () => {
	it("portal: duas turmas com idTurma, da lista de turmas e não do quadro de atualizações", () => {
		const turmas = lerPortal(pagina("portal.html"));
		assert.deepEqual(turmas.map((t) => [t.idTurma, t.nome]), [["1001", "CÁLCULO TESTE"], ["1002", "DISCIPLINA TESTE II"]]);
		assert.equal(turmas[1]!.link.form, "form_acessarTurmaVirtual");
		assert.equal(turmas[1]!.link.params.idTurma, "1002", "o idTurma vai nos parâmetros: os formulários repetem o mesmo id");
		assert.equal(turmas[1]!.link.params["form_acessarTurmaVirtual:turmaVirtual"], "form_acessarTurmaVirtual:turmaVirtual");
	});
});

describe("portal sem a lista de turmas", () => {
	const sem = (links: string) => `<html><body><div id="conteudo">${links}</div></body></html>`;
	const link = (form: string, id: string, texto: string) =>
		`<form id="${form}" action="/sigaa/portais/discente/discente.jsf"><a href="#" onclick="if(typeof jsfcljs == 'function'){jsfcljs(document.getElementById('${form}'),{'${form}:x':'${form}:x','idTurma':'${id}'},'');}return false">${texto}</a></form>`;

	it("só usa links dos formulários de turma conhecidos (revisão final, #16)", () => {
		const html = sem(link("formAtualizacoesTurmas", "1001", "CÁLCULO TESTE (2026.2)") + link("formRelatorioNotas", "9999", "Relatório de notas"));
		assert.deepEqual(lerPortal(html).map((t) => [t.idTurma, t.nome]), [["1001", "CÁLCULO TESTE"]]);
	});
});

describe("turma", () => {
	it("cabeçalho com acento decodificado", () => {
		assert.deepEqual(lerCabecalho(pagina("turma-principal.html")), { codigo: "ICE0001", nome: "CÁLCULO TESTE", semestre: "2026-2", sufixo: "TA" });
		assert.deepEqual(lerCabecalho(pagina("turma2-principal.html")), { codigo: "ICE0002", nome: "DISCIPLINA TESTE II", semestre: "2026-2", sufixo: "TB" });
		assert.throws(() => lerCabecalho("<html><body>nada</body></html>"), SigaaEstruturaError);
	});

	it("tópicos: período, data única da aula cancelada, prova como tópico", () => {
		const t = lerTopicos(pagina("turma-principal.html"));
		assert.deepEqual(t.map((x) => [x.titulo, x.inicio, x.fim]), [
			["Limites", "2026-09-01", "2026-09-01"],
			["Não Haverá Aula", "2026-09-02", undefined],
			["Avaliação da aprendizagem", "2026-09-03", "2026-09-03"],
			["Regra da cadeia", "2026-09-04", "2026-09-04"],
		]);
		assert.equal(t[0]!.descricao, "Notas de aula sobre limites.");
		assert.equal(t[1]!.descricao, "Falta de energia no campus de teste.");
		assert.equal(t[2]!.descricao, "");
		assert.equal(t[3]!.descricao, "Exemplos resolvidos em sala.", "sem os nomes dos materiais nem scripts");
	});

	it("menu: só itens de formMenu, com os rótulos da UFJ", () => {
		const m = lerMenu(pagina("turma-principal.html"));
		assert.deepEqual(m.map((i) => i.rotulo), ["Principal", "Plano de Ensino", "Participantes", "Notícias", "Frequência", "Ver Notas", "Fóruns", "Referências", "Arquivos", "Avaliações", "Tarefas", "Questionários"]);
		assert.ok(m.every((i) => i.link.form === "formMenu"));
	});

	it("docente vem do Cadastrado por, em Nome Próprio", () => {
		assert.equal(lerDocente(pagina("turma-principal.html")), "Prof. Exemplo Teste");
		assert.equal(lerDocente(pagina("turma2-principal.html")), undefined);
	});
});

describe("seções", () => {
	it("avaliações: id, data, hora e descrição; vazia vira []", () => {
		assert.deepEqual(lerAvaliacoes(pagina("turma-avaliacoes.html")), [
			{ sigaaId: "7001", data: "2026-09-10", hora: "53", descricao: "2ª unidade" },
			{ sigaaId: "7002", data: "2026-09-20", hora: "20:45", descricao: "3ª unidade" },
		]);
		assert.deepEqual(lerAvaliacoes(pagina("turma-avaliacoes-vazia.html")), []);
	});

	it("arquivos: id, título, descrição e tópico de aula", () => {
		const a = lerArquivos(pagina("turma-arquivos.html"));
		assert.deepEqual(a.map(({ link: _l, ...x }) => x), [
			{ sigaaId: "5001", titulo: "Aula 1 - Limites", descricao: "", topicoDeAula: "Limites" },
			{ sigaaId: "5002", titulo: "Lista de regra da cadeia", descricao: "Para entregar na sexta", topicoDeAula: "Regra da cadeia" },
			{ sigaaId: "5003", titulo: "Exemplos", descricao: "", topicoDeAula: "Regra da cadeia" },
			{ sigaaId: "5004", titulo: "Ficha de avaliação", descricao: "", topicoDeAula: "Regra da cadeia" },
		]);
		assert.equal(a[0]!.link.form, "formAva");
		assert.equal(a[0]!.link.params.id, "5001");
	});
});
