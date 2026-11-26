/** O resumo do semestre que entra em todo chat e os textos da ferramenta `ufj`
 * (spec chat+SIGAA §5.2–5.3). Funções puras; dados fictícios. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeResumoUfj, textoMateria, textoMaterias, textoNoticia, turmasVisiveis, type Referencias, type TurmaDaMateria } from "../src/core/index.ts";
import { materiaValida, turmaValida } from "./helpers/biblioteca-fixtures.ts";

const HOJE = new Date(2026, 10, 25); // 25/11/2026

function calculo(): TurmaDaMateria {
	return {
		materia: { ...materiaValida(), codigo: "ICE0001", nome: "Cálculo Teste", topicos: [{ id: "limites", titulo: "Limites" }, { id: "regra-da-cadeia", titulo: "Regra da cadeia" }] },
		turma: {
			...turmaValida(),
			id: "2026-2-turma-ta",
			docente: { nome: "Prof. Exemplo", slug: "sigaa" },
			sigaa: { idTurma: "1001", sufixo: "TA", sincronizadoEm: "2026-11-24T12:00:00.000Z" },
			aulas: [
				{ ordem: 1, rotulo: "1", data: "2026-09-01", conteudo: "Limites", topicos: ["limites"], sigaa: { titulo: "Limites" } },
				{ ordem: 2, rotulo: "2", data: "2026-09-04", conteudo: "Regra da cadeia", topicos: ["regra-da-cadeia"], sigaa: { titulo: "Regra da cadeia" } },
			],
			avaliacoes: [
				{ id: "sigaa-7001", nome: "2ª unidade", tipo: "prova-escrita", data: "2026-12-03", origemData: "sigaa", sigaaId: "7001", escopo: { topicos: ["regra-da-cadeia"] } },
				{ id: "sigaa-7002", nome: "3ª unidade", tipo: "prova-escrita", data: "2026-09-20", origemData: "sigaa", sigaaId: "7002", escopo: { topicos: [] } },
			],
			tarefas: [{ titulo: "Lista 3", inicio: "2026-11-20", fim: "2026-11-26", hora: "23:59", instrucoes: "Exercícios 1 a 5.", temArquivo: true }],
			noticias: [{ sigaaId: "8001", titulo: "Revisão na sexta", data: "2026-11-20", texto: "Teremos revisão na sexta, sala 2." }],
		},
	};
}

function disciplina2(): TurmaDaMateria {
	return {
		materia: { ...materiaValida(), codigo: "ICE0002", nome: "Disciplina Teste II", topicos: [] },
		turma: {
			...turmaValida(),
			id: "2026-2-turma-tb",
			docente: { nome: "", slug: "sigaa" },
			sigaa: { idTurma: "1002", sufixo: "TB", sincronizadoEm: "2026-11-24T12:00:00.000Z" },
			aulas: [],
			avaliacoes: [{ id: "3a-prova", nome: "3ª prova", tipo: "prova-escrita", data: "2026-11-27", origemData: "manual", escopo: { topicos: [] } }],
			tarefas: [{ titulo: "Trabalho 1", fim: "2026-12-02", instrucoes: "", temArquivo: false }],
		},
	};
}

describe("resumo do semestre", () => {
	it("texto exato para duas turmas", () => {
		assert.equal(composeResumoUfj([calculo(), disciplina2()], HOJE), [
			"[Semestre UFJ — 25/11/2026]",
			"Matérias: ICE0001 Cálculo Teste (2026-2); ICE0002 Disciplina Teste II (2026-2).",
			"Próximas provas: 27/11 Disciplina Teste II — 3ª prova (em 2 dias); 03/12 Cálculo Teste — 2ª unidade (em 8 dias).",
			"Próximas tarefas: 26/11 23:59 Cálculo Teste — Lista 3 (em 1 dia); 02/12 Disciplina Teste II — Trabalho 1 (em 7 dias).",
			"Para tópicos, arquivos do professor, instruções de tarefas e avisos, use a ferramenta `ufj`. Leia os arquivos pelo caminho que ela devolve.",
		].join("\n"));
	});

	it("sem turmas, resumo vazio e textoMaterias avisa", () => {
		assert.equal(composeResumoUfj([], HOJE), "");
		assert.equal(textoMaterias([]), "Nenhuma matéria sincronizada ainda.");
	});

	it("matéria sem prova nos 21 dias entra com a próxima futura dela, mesmo quando outra matéria tem prova no prazo; passadas ficam de fora", () => {
		const c = calculo();
		c.turma.avaliacoes[0]!.data = "2027-01-15";
		assert.match(composeResumoUfj([c], HOJE), /Próximas provas: 15\/01 Cálculo Teste — 2ª unidade \(em 51 dias\)\./);
		const r = composeResumoUfj([c, disciplina2()], HOJE);
		assert.match(r, /Próximas provas: 27\/11 Disciplina Teste II — 3ª prova \(em 2 dias\); 15\/01 Cálculo Teste — 2ª unidade \(em 51 dias\)\./);
		assert.doesNotMatch(r, /3ª unidade/);
	});

	it("sem rodapé para quem não tem a ferramenta (conversa lateral)", () => {
		const r = composeResumoUfj([calculo()], HOJE, { rodape: false });
		assert.doesNotMatch(r, /ferramenta `ufj`/);
		assert.match(r, /Próximas tarefas: [^\n]*\.$/);
	});

	it("segunda turma do SIGAA, de outro semestre, é marcada como tal e não como plano importado", () => {
		const atual = calculo();
		const antiga: TurmaDaMateria = { materia: atual.materia, turma: { ...atual.turma, id: "2025-2-turma-ta", semestre: "2025-2", revisadoEm: "2025-12-01T00:00:00.000Z" } };
		const lista = textoMaterias([antiga, atual]);
		assert.match(lista, /\(2025-2[^\n]*\(SIGAA, outro semestre\)/);
		assert.doesNotMatch(lista, /plano importado/);
	});

	it("turma de plano e turma do SIGAA: a do SIGAA aparece; a outra só em materias com a marca", () => {
		const plano: TurmaDaMateria = { materia: calculo().materia, turma: { ...turmaValida(), id: "2026-2-prof-exemplo", avaliacoes: [{ id: "N2", nome: "2ª prova", tipo: "prova-escrita", data: "2026-12-05", escopo: { topicos: [] } }] } };
		const { visiveis, outras } = turmasVisiveis([plano, calculo()]);
		assert.deepEqual(visiveis.map((v) => v.turma.id), ["2026-2-turma-ta"]);
		assert.deepEqual(outras.map((v) => v.turma.id), ["2026-2-prof-exemplo"]);
		const resumo = composeResumoUfj([plano, calculo()], HOJE);
		assert.doesNotMatch(resumo, /2ª prova/);
		assert.match(resumo, /2ª unidade/);
		const lista = textoMaterias([plano, calculo()]);
		assert.match(lista, /^ICE0001 Cálculo Teste \(2026-2, Prof\. Exemplo\): provas: 2ª unidade 03\/12 \(do SIGAA\); 3ª unidade 20\/09 \(do SIGAA\)$/m);
		assert.match(lista, /\(plano importado\)/);
	});

	it("corta em 12 compromissos: as provas primeiro, as tarefas com o que sobrar", () => {
		const muitas: TurmaDaMateria[] = Array.from({ length: 15 }, (_, i) => {
			const c = calculo();
			c.materia = { ...c.materia, codigo: `ICE00${String(i).padStart(2, "0")}`, nome: `Matéria ${i}` };
			c.turma = { ...c.turma, avaliacoes: [{ ...c.turma.avaliacoes[0]!, data: `2026-12-${String(1 + i).padStart(2, "0")}` }] };
			return c;
		});
		const r = composeResumoUfj(muitas, HOJE);
		assert.equal((r.match(/— 2ª unidade/g) ?? []).length, 12, "12 provas, da mais próxima");
		assert.match(r, /Matéria 11 — 2ª unidade/);
		assert.doesNotMatch(r, /Matéria 12 — 2ª unidade|Próximas tarefas/, "as tarefas não cabem");
		const poucas = muitas.slice(0, 10);
		assert.equal((composeResumoUfj(poucas, HOJE).match(/Lista 3/g) ?? []).length, 2, "sobram 2 vagas para tarefas");
	});

	it("textoMateria lista tópicos, provas, tarefas, notícias e arquivos com caminho; textoNoticia devolve o texto", () => {
		const refs: Referencias = { formato: 1, arquivos: [{ arquivo: "regra.pdf", titulo: "Lista de regra da cadeia", sha256: "0".repeat(64), topicos: ["regra-da-cadeia"], sigaaId: "55", aula: 2 }] };
		const t = textoMateria(calculo(), refs, (a) => `/dados/${a}`);
		assert.match(t, /^Tópicos:\n- limites — Limites — aulas 01\/09\n- regra-da-cadeia — Regra da cadeia — aulas 04\/09$/m);
		assert.match(t, /^Provas:\n- 2ª unidade — 03\/12\/2026 \(do SIGAA\) — escopo: regra-da-cadeia$/m);
		assert.match(t, /^Tarefas:\n- Lista 3 — até 26\/11\/2026 23:59 — com arquivo — Exercícios 1 a 5\.$/m);
		assert.match(t, /^Notícias:\n- 8001 20\/11\/2026 Revisão na sexta$/m);
		assert.match(t, /^Arquivos:\n- Lista de regra da cadeia — \/dados\/regra\.pdf — tópico de aula: Regra da cadeia$/m);
		assert.equal(textoNoticia(calculo(), "8001"), "Revisão na sexta (20/11/2026)\nTeremos revisão na sexta, sala 2.");
		assert.equal(textoNoticia(calculo(), "zzz"), null);
	});
});
