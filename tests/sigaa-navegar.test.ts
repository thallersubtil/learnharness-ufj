/** Navegar pelas turmas do SIGAA e baixar os arquivos novos (spec SIGAA §7.3),
 * contra o SIGAA falso local. Dados inventados; nenhuma rede. */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { SigaaSessao } from "../src/server/sigaa/http.ts";
import { entrar } from "../src/server/sigaa/login.ts";
import { ipynbParaTexto, lerSigaa, nomeDoArquivo, podeLerSecao, type ArquivoBaixado } from "../src/server/sigaa/navegar.ts";
import type { SigaaTurmaLida } from "../src/core/index.ts";
import { iniciarSigaaFalso, type OpcoesSigaaFalso, type SigaaFalso } from "./helpers/sigaa-falso.ts";

const abertos: SigaaFalso[] = [];
after(async () => {
	for (const s of abertos) await s.fechar();
});

async function ler(opcoes: OpcoesSigaaFalso = {}, jaBaixado: (id: string) => boolean = () => false) {
	const f = await iniciarSigaaFalso(opcoes);
	abertos.push(f);
	const sessao = new SigaaSessao({ base: f.base, esperarMs: 0 });
	const portal = await entrar(sessao, "aluno.teste", "segredo");
	const lidas: { lida: SigaaTurmaLida; baixados: ArquivoBaixado[] }[] = [];
	const leitura = await lerSigaa(sessao, portal, {
		jaBaixado: (_l, id) => jaBaixado(id),
		aoLerTurma: (lida, baixados) => lidas.push({ lida, baixados }),
		tamanhoMaximo: 26 * 1024 * 1024,
	});
	return { f, leitura, lidas };
}

const baixouId = (f: SigaaFalso, id: string) => f.pedidos.some((p) => p.caminho.startsWith("/sigaa/ava/ArquivoTurma/listar_discente.jsf") && new RegExp(`(^|&)id=${id}(&|$)`).test(p.corpo));

describe("navegar pelo SIGAA", () => {
	it("lê as duas turmas com tópicos, avaliações e arquivos", async () => {
		const { leitura, lidas } = await ler();
		assert.deepEqual(leitura, { turmasNoPortal: 2, turmasLidas: 2, falhas: [] });
		const [a, b] = lidas;
		assert.equal(a!.lida.idTurma, "1001");
		assert.equal(a!.lida.codigo, "ICE0001");
		assert.equal(a!.lida.nome, "CÁLCULO TESTE");
		assert.equal(a!.lida.semestre, "2026-2");
		assert.equal(a!.lida.sufixo, "TA");
		assert.equal(a!.lida.docente, "Prof. Exemplo Teste");
		assert.equal(a!.lida.topicos.length, 4);
		assert.deepEqual(a!.lida.avaliacoes.map((x) => x.sigaaId), ["7001", "7002"]);
		assert.deepEqual(a!.lida.arquivos.map((x) => x.sigaaId), ["5001", "5002", "5003", "5004"]);
		assert.ok(!("link" in a!.lida.arquivos[0]!), "a leitura não carrega o comando JSF");
		assert.deepEqual(a!.baixados.map((x) => x.nome), ["Aula_1_Limites.pdf", "Lista_regra_da_cadeia.pdf", "Exemplos.ipynb.md", "Ficha de avaliação.docx"]);
		assert.equal(new TextDecoder().decode(a!.baixados[0]!.bytes), "%PDF-1.4 limites");
		assert.equal(b!.lida.codigo, "ICE0002");
		assert.deepEqual(b!.lida.avaliacoes, []);
		assert.deepEqual(b!.baixados.map((x) => x.sigaaId), ["6001"]);
	});

	it("nunca abre seção proibida", async () => {
		const { f } = await ler();
		assert.ok(!f.pedidos.some((p) => /formMenu%3Aj_id_jsp_1_(83|85|86|87)=/.test(p.corpo)), "Participantes, Frequência, Ver Notas, Fóruns");
		assert.equal(podeLerSecao("Ver Notas"), false);
		assert.equal(podeLerSecao("Participantes"), false);
		assert.equal(podeLerSecao("FREQUÊNCIA"), false);
		assert.equal(podeLerSecao("Arquivos"), true);
	});

	it("baixa só o que não tem", async () => {
		const { f, lidas } = await ler({}, (id) => id === "5001");
		assert.ok(!lidas[0]!.baixados.some((x) => x.sigaaId === "5001"));
		assert.ok(!baixouId(f, "5001"));
		assert.ok(baixouId(f, "5002"));
	});

	it("avisa o progresso: cada turma e cada arquivo baixado", async () => {
		const f = await iniciarSigaaFalso();
		abertos.push(f);
		const sessao = new SigaaSessao({ base: f.base, esperarMs: 0 });
		const portal = await entrar(sessao, "aluno.teste", "segredo");
		const passos: string[] = [];
		await lerSigaa(sessao, portal, {
			jaBaixado: (_l, id) => id === "5001",
			aoLerTurma: () => {},
			tamanhoMaximo: 26 * 1024 * 1024,
			progresso: (p) => passos.push(p.etapa === "turma" ? `turma ${p.turmaAtual}/${p.totalTurmas}` : `arquivo ${p.arquivoAtual}/${p.totalArquivos}`),
		});
		assert.deepEqual(passos, ["turma 1/2", "arquivo 1/3", "arquivo 2/3", "arquivo 3/3", "turma 2/2", "arquivo 1/1"]);
	});

	it("aoLerTurma é chamada uma vez por turma, na ordem do portal", async () => {
		const { lidas } = await ler();
		assert.deepEqual(lidas.map((x) => x.lida.idTurma), ["1001", "1002"]);
	});

	it("seção quebrada numa turma não derruba a outra", async () => {
		const { leitura, lidas } = await ler({ secaoQuebrada: { idTurma: "1001", rotulo: "Avaliações" } });
		assert.equal(leitura.falhas.length, 1);
		assert.equal(leitura.falhas[0]!.idTurma, "1001");
		assert.match(leitura.falhas[0]!.erro, /Avaliações/);
		assert.deepEqual(lidas.map((x) => x.lida.idTurma), ["1002"]);
	});

	it("sessão que cai para a leitura sem logar de novo", async () => {
		const { f, leitura, lidas } = await ler({ derrubarSessaoDepois: 3 });
		assert.equal(lidas.length, 0);
		assert.equal(leitura.falhas.length, 1, "as turmas seguintes não são tentadas");
		assert.match(leitura.falhas[0]!.erro, /sessão/);
		assert.equal(f.pedidos.filter((p) => p.metodo === "POST" && p.caminho.startsWith("/sigaa/logar.do")).length, 1);
	});

	it("download que expira a página reabre a lista e continua", async () => {
		const { leitura, lidas } = await ler({ umDownloadPorPagina: true });
		assert.deepEqual(leitura.falhas, []);
		assert.equal(lidas[0]!.baixados.length, 4);
	});

	it("download que redireciona para o servidor de arquivos funciona, sem levar cookie (sincronização real, 24/11)", async () => {
		const f = await iniciarSigaaFalso({ arquivosEmOutroHost: true });
		abertos.push(f);
		const sessao = new SigaaSessao({ base: f.base, esperarMs: 0, origensDeArquivos: [f.origemArquivos!] });
		const portal = await entrar(sessao, "aluno.teste", "segredo");
		const lidas: ArquivoBaixado[][] = [];
		const leitura = await lerSigaa(sessao, portal, { jaBaixado: () => false, aoLerTurma: (_l, b) => lidas.push(b), tamanhoMaximo: 26 * 1024 * 1024 });
		assert.deepEqual(leitura.falhas, []);
		assert.deepEqual(lidas[0]!.map((x) => x.nome), ["Aula_1_Limites.pdf", "Lista_regra_da_cadeia.pdf", "Exemplos.ipynb.md", "Ficha de avaliação.docx"]);
		assert.equal(f.pedidosArquivos.length, 5);
		assert.ok(f.pedidosArquivos.every((p) => p.cookie === null));
	});

	it("sem o servidor de arquivos na lista, o redirecionamento é recusado e a turma vira falha", async () => {
		const f = await iniciarSigaaFalso({ arquivosEmOutroHost: true });
		abertos.push(f);
		const sessao = new SigaaSessao({ base: f.base, esperarMs: 0 });
		const portal = await entrar(sessao, "aluno.teste", "segredo");
		const leitura = await lerSigaa(sessao, portal, { jaBaixado: () => false, aoLerTurma: () => {}, tamanhoMaximo: 26 * 1024 * 1024 });
		assert.equal(leitura.turmasLidas, 0);
		assert.match(leitura.falhas[0]!.erro, /redirecionamento para outro endereço \(http:\/\/127\.0\.0\.1:\d+\)/);
	});

	it("nome comprido com acento é cortado por bytes e mantém a extensão (revisão final, #11)", () => {
		const longo = `${"Introdução à Computação ".repeat(20)}.pdf`;
		const nome = nomeDoArquivo(`attachment; filename="${Buffer.from(longo, "utf8").toString("latin1")}"`, "reserva");
		assert.ok(Buffer.byteLength(nome, "utf8") <= 200, String(Buffer.byteLength(nome, "utf8")));
		assert.ok(nome.endsWith(".pdf"), nome);
		assert.ok(nome.startsWith("Introdução à Computação"), nome);
	});

	it("ipynb vira texto com o código e sem as saídas", async () => {
		const { lidas } = await ler();
		const nb = new TextDecoder().decode(lidas[0]!.baixados.find((x) => x.nome === "Exemplos.ipynb.md")!.bytes);
		assert.match(nb, /# Exemplos/);
		assert.match(nb, /```python\ndef derivada\(x\):\n {4}return 2 \* x\n```/);
		assert.doesNotMatch(nb, /SAIDA_GRANDE/);
		assert.equal(ipynbParaTexto("não é json"), "não é json");
	});
});
