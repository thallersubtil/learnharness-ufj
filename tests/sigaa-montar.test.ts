/** Montar matéria, turma e referências a partir da leitura do SIGAA (spec
 * SIGAA §7.4–7.6). Função pura; dados fictícios. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ehAulaCancelada,
	ehTopicoDeProva,
	idTurmaSigaa,
	montarDoSigaa,
	progressoDaLeitura,
	nomeDeDisciplina,
	type Montagem,
	type Referencias,
	type SigaaTurmaLida,
} from "../src/core/index.ts";
import { materiaValida } from "./helpers/biblioteca-fixtures.ts";

const AGORA = "2026-09-05T12:00:00.000Z";
const SEM_REFS: Referencias = { formato: 1, arquivos: [] };
const SHA = "0".repeat(64);

function lida(over: Partial<SigaaTurmaLida> = {}): SigaaTurmaLida {
	return {
		idTurma: "123",
		codigo: "ICE0001",
		nome: "DISCIPLINA TESTE",
		semestre: "2026-2",
		sufixo: "TA",
		topicos: [
			{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" },
			{ titulo: "Não Haverá Aula", inicio: "2026-09-02", descricao: "Falta de energia." },
			{ titulo: "Avaliação da aprendizagem", inicio: "2026-09-03", fim: "2026-09-03", descricao: "" },
			{ titulo: "Regra da cadeia", inicio: "2026-09-04", fim: "2026-09-04", descricao: "Exemplos" },
		],
		avaliacoes: [{ sigaaId: "999", data: "2026-09-10", descricao: "2ª unidade" }],
		arquivos: [{ sigaaId: "55", titulo: "Slides da regra da cadeia", descricao: "", topicoDeAula: "Regra da cadeia" }],
		...over,
	};
}

const primeira = (over: Partial<SigaaTurmaLida> = {}, referencias = SEM_REFS): Montagem =>
	montarDoSigaa(lida(over), { materia: null, turma: null, referencias }, AGORA);
const proxima = (antes: Montagem, over: Partial<SigaaTurmaLida>, agora = AGORA): Montagem =>
	montarDoSigaa(lida(over), { materia: antes.materia, turma: antes.turma, referencias: antes.referencias }, agora);
const prova = (m: Montagem, id = "sigaa-999") => m.turma.avaliacoes.find((a) => a.id === id)!;

describe("montar a partir do SIGAA", () => {
	it("monta matéria nova, turma 2026-2-turma-ta e aulas na ordem", () => {
		const m = primeira();
		assert.equal(m.materia.nome, "Disciplina Teste");
		assert.equal(m.materia.curso, "");
		assert.equal(m.turma.id, "2026-2-turma-ta");
		assert.deepEqual(m.turma.docente, { nome: "", slug: "sigaa" });
		assert.deepEqual(m.turma.sigaa, { idTurma: "123", sufixo: "TA", sincronizadoEm: AGORA });
		assert.equal(m.turma.importadoEm, AGORA);
		assert.deepEqual(m.turma.aulas.map((a) => a.ordem), [1, 2, 3, 4]);
		assert.equal(m.turma.aulas[1]!.sigaa?.cancelada, true);
		assert.deepEqual(m.turma.aulas[1]!.topicos, []);
		assert.equal(m.turma.aulas[2]!.sigaa?.prova, true);
		assert.equal(m.turma.aulas[3]!.conteudo, "Regra da cadeia — Exemplos");
		assert.equal(m.turma.aulas[3]!.rotulo, "4");
		assert.deepEqual(m.materia.topicos.map((t) => t.id), ["limites", "regra-da-cadeia"]);
	});

	it("a prova do SIGAA tem escopo depois da aula de prova", () => {
		const av = prova(primeira());
		assert.equal(av.origemData, "sigaa");
		assert.equal(av.sigaaId, "999");
		assert.equal(av.nome, "2ª unidade");
		assert.deepEqual(av.escopo.topicos, ["regra-da-cadeia"]);
	});

	it("liga o arquivo ao tópico do professor", () => {
		const m = primeira({}, { formato: 1, arquivos: [{ arquivo: "regra.pdf", sha256: SHA, topicos: [], sigaaId: "55" }] });
		assert.deepEqual(m.referencias.arquivos[0], { arquivo: "regra.pdf", sha256: SHA, topicos: ["regra-da-cadeia"], sigaaId: "55", aula: 4, titulo: "Slides da regra da cadeia" });
	});

	it("arquivo .docx fica na aula sem ir para os tópicos", () => {
		const m = primeira(
			{ arquivos: [{ sigaaId: "56", titulo: "Ficha", descricao: "", topicoDeAula: "Regra da cadeia" }] },
			{ formato: 1, arquivos: [{ arquivo: "ficha.docx", sha256: SHA, topicos: [], sigaaId: "56" }] },
		);
		assert.deepEqual(m.referencias.arquivos[0]!.topicos, []);
		assert.equal(m.referencias.arquivos[0]!.aula, 4);
	});

	it("renomear na mesma posição e período mantém o id", () => {
		const antes = primeira();
		const topicos = lida().topicos.map((t) => (t.titulo === "Regra da cadeia" ? { ...t, titulo: "Regra da cadeia (derivadas)" } : t));
		const m = proxima(antes, { topicos });
		assert.deepEqual(m.turma.aulas[3]!.topicos, ["regra-da-cadeia"]);
		assert.equal(m.materia.topicos.find((t) => t.id === "regra-da-cadeia")!.titulo, "Regra da cadeia (derivadas)");
	});

	it("inserir um tópico antes não muda os ids existentes", () => {
		const antes = primeira();
		const [a, ...resto] = lida().topicos;
		const m = proxima(antes, { topicos: [a!, { titulo: "Continuidade", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" }, ...resto] });
		assert.deepEqual(m.turma.aulas.map((x) => x.topicos), [["limites"], ["continuidade"], [], [], ["regra-da-cadeia"]]);
	});

	it("tópico que some vira arquivado", () => {
		const antes = primeira();
		const m = proxima(antes, { topicos: lida().topicos.filter((t) => t.titulo !== "Limites") });
		assert.equal(m.materia.topicos.find((t) => t.id === "limites")?.arquivado, true);
	});

	it("data do SIGAA sobrescreve a data à mão", () => {
		const antes = primeira();
		antes.turma.avaliacoes = antes.turma.avaliacoes.map((a) => (a.id === "sigaa-999" ? { ...a, data: "2026-09-12", origemData: "manual" as const } : a));
		const m = proxima(antes, {});
		assert.equal(prova(m).data, "2026-09-10");
		assert.equal(prova(m).origemData, "sigaa");
		assert.ok(m.avisos.includes("O SIGAA mudou a 2ª unidade de 12/09 para 10/09."), JSON.stringify(m.avisos));
	});

	it("avaliação que some do SIGAA fica como à mão", () => {
		const m = proxima(primeira(), { avaliacoes: [] });
		const av = prova(m);
		assert.equal(av.data, "2026-09-10");
		assert.equal(av.origemData, "manual");
		assert.equal(av.sigaaId, undefined);
	});

	it("avaliação que some e volta não duplica a prova (revisão final, C1)", () => {
		const sumiu = proxima(primeira(), { avaliacoes: [] });
		const voltou = proxima(sumiu, {});
		assert.equal(voltou.turma.avaliacoes.filter((a) => a.id === "sigaa-999").length, 1);
		assert.equal(prova(voltou).origemData, "sigaa");
		assert.equal(prova(voltou).sigaaId, "999");
	});

	it("tópico que some e volta mantém o id (revisão final, I3)", () => {
		const sumiu = proxima(primeira(), { topicos: lida().topicos.filter((t) => t.titulo !== "Limites") });
		const voltou = proxima(sumiu, {});
		assert.deepEqual(voltou.turma.aulas[0]!.topicos, ["limites"]);
		assert.equal(voltou.materia.topicos.find((t) => t.id === "limites")!.arquivado, undefined);
		assert.ok(!voltou.materia.topicos.some((t) => t.id === "limites-2"));
	});

	it("prova à mão continua como está", () => {
		const antes = primeira();
		antes.turma.avaliacoes.push({ id: "3a-prova", nome: "3ª prova", tipo: "prova-escrita", data: "2026-09-20", origemData: "manual", escopo: { topicos: [] } });
		const m = proxima(antes, {});
		assert.equal(prova(m, "3a-prova").data, "2026-09-20");
		assert.equal(prova(m, "3a-prova").origemData, "manual");
	});

	it("hora '53' é descartada; '20:45' fica", () => {
		const m = primeira({ avaliacoes: [{ sigaaId: "999", data: "2026-09-10", hora: "53", descricao: "2ª unidade" }, { sigaaId: "1000", data: "2026-09-20", hora: "20:45", descricao: "3ª unidade" }] });
		assert.equal(prova(m).hora, undefined);
		assert.equal(prova(m, "sigaa-1000").hora, "20:45");
	});

	it("avisa a data que o SIGAA mudou e os tópicos que entraram na prova", () => {
		const antes = primeira();
		const topicos = [...lida().topicos, { titulo: "Derivadas implícitas", inicio: "2026-09-08", fim: "2026-09-08", descricao: "" }];
		const m = proxima(antes, { topicos, avaliacoes: [{ sigaaId: "999", data: "2026-09-11", descricao: "2ª unidade" }] });
		assert.deepEqual(m.avisos, ["O SIGAA mudou a 2ª unidade de 10/09 para 11/09.", "A 2ª unidade passou a incluir: Derivadas implícitas."]);
	});

	it("a aula de prova se liga à prova da mesma data", () => {
		const m = primeira({ avaliacoes: [{ sigaaId: "998", data: "2026-09-03", descricao: "1ª unidade" }] });
		assert.equal(m.turma.aulas[2]!.avaliacaoId, "sigaa-998");
		assert.deepEqual(prova(m, "sigaa-998").escopo.topicos, ["limites"]);
	});

	it("matéria existente: nome e ementa ficam, tópicos de outra turma ficam", () => {
		const m = montarDoSigaa(lida(), { materia: materiaValida(), turma: null, referencias: SEM_REFS }, AGORA);
		assert.equal(m.materia.nome, "Disciplina Teste");
		assert.equal(m.materia.ementa, "Limites. Derivadas.");
		const ids = m.materia.topicos.map((t) => t.id);
		for (const id of ["limites", "derivadas", "antigo", "regra-da-cadeia"]) assert.ok(ids.includes(id), id);
		assert.ok(!ids.includes("limites-2"), "o mesmo título é o mesmo tópico da matéria (revisão final, I3)");
		assert.deepEqual(m.turma.aulas[0]!.topicos, ["limites"]);
	});
});

describe("progresso da sincronização", () => {
	it("a fração anda por turma e, dentro da turma, por arquivo", () => {
		assert.deepEqual(progressoDaLeitura({ turma: "CÁLCULO I", turmaAtual: 1, totalTurmas: 5, etapa: "turma" }), { fracao: 0.02, texto: "Lendo Cálculo I (turma 1 de 5)" });
		assert.deepEqual(progressoDaLeitura({ turma: "ESTRUTURA DE DADOS I", turmaAtual: 3, totalTurmas: 5, etapa: "arquivos", arquivoAtual: 12, totalArquivos: 29 }), {
			fracao: 0.4 + (0.1 + (0.9 * 11) / 29) / 5,
			texto: "Estrutura de Dados I: baixando arquivo 12 de 29 (turma 3 de 5)",
		});
		assert.ok(progressoDaLeitura({ turma: "X", turmaAtual: 5, totalTurmas: 5, etapa: "arquivos", arquivoAtual: 9, totalArquivos: 9 }).fracao < 1, "só chega a 100% quando termina");
	});
});

describe("ajudantes de título", () => {
	it("nomeDeDisciplina", () => {
		assert.equal(nomeDeDisciplina("PROGRAMAÇÃO ORIENTADA A OBJETOS"), "Programação Orientada a Objetos");
		assert.equal(nomeDeDisciplina("CÁLCULO I"), "Cálculo I");
		assert.equal(nomeDeDisciplina("ESTRUTURA DE DADOS I"), "Estrutura de Dados I");
		assert.equal(nomeDeDisciplina("ARQUITETURA DE COMPUTADORES"), "Arquitetura de Computadores");
	});

	it("ehTopicoDeProva", () => {
		assert.equal(ehTopicoDeProva("Avaliação da aprendizagem"), true);
		assert.equal(ehTopicoDeProva("Avaliação de aprendizagem"), true);
		assert.equal(ehTopicoDeProva("Prova 1"), true);
		assert.equal(ehTopicoDeProva("2ª prova"), true);
		assert.equal(ehTopicoDeProva("N2"), true);
		assert.equal(ehTopicoDeProva("AV3 - teórica"), true);
		assert.equal(ehTopicoDeProva("Correção da avaliação e derivadas implícitas."), false);
		assert.equal(ehTopicoDeProva("Pilhas com ponteiros"), false);
	});

	it("ehAulaCancelada e idTurmaSigaa", () => {
		assert.equal(ehAulaCancelada("Não Haverá Aula"), true);
		assert.equal(ehAulaCancelada("Aula de revisão"), false);
		assert.equal(idTurmaSigaa("2026-2", "TA"), "2026-2-turma-ta");
		assert.equal(idTurmaSigaa("2026-2"), "2026-2-sigaa");
	});
});
