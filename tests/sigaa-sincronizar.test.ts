/** Sincronização com a conta UFJ (spec SIGAA §7.2–7.4), contra o SIGAA falso
 * local, com a pasta de dados temporária e um chaveiro falso. Dados inventados. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sigaa-sync-"));
process.env.LH_DATA_DIR = TMP;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { createSincronizacao, SigaaOcupadoError } = await import("../src/server/sigaa/sincronizar.ts");
const { createBibliotecaService } = await import("../src/server/biblioteca.ts");
const { sigaaEstadoRoute, sigaaConectarRoute, sigaaSairRoute, sigaaSincronizarRoute } = await import("../src/server/sigaa/rotas.ts");
const { SigaaSessao } = await import("../src/server/sigaa/http.ts");
const { bibliotecaStore } = await import("../src/store/biblioteca.ts");
const { sigaaStore } = await import("../src/store/sigaa.ts");
const { adicionarProva, definirDataProva } = await import("../src/core/index.ts");
const { BIBLIOTECA_DIR, SIGAA_DIR } = await import("../config.ts");
const { iniciarSigaaFalso } = await import("./helpers/sigaa-falso.ts");
type OpcoesSigaaFalso = import("./helpers/sigaa-falso.ts").OpcoesSigaaFalso;
type SigaaFalso = import("./helpers/sigaa-falso.ts").SigaaFalso;

const abertos: SigaaFalso[] = [];
after(async () => {
	for (const s of abertos) await s.fechar();
});
beforeEach(() => {
	fs.rmSync(BIBLIOTECA_DIR, { recursive: true, force: true });
	fs.rmSync(SIGAA_DIR, { recursive: true, force: true });
});

const TURMA = "2026-2-turma-ta";
let emitidos = 0;

async function montar(opcoes: OpcoesSigaaFalso = {}, compartilhado?: { andamento: Promise<void> | null }, extra: { biblioteca?: typeof bibliotecaStore } = {}) {
	const f = await iniciarSigaaFalso(opcoes);
	abertos.push(f);
	const s = createSincronizacao({
		...(compartilhado ? { compartilhado } : {}),
		biblioteca: extra.biblioteca ?? bibliotecaStore,
		sigaa: sigaaStore,
		cifrar: async (t) => `teste:${t}`,
		decifrar: async (c) => c.replace(/^teste:/, ""),
		novaSessao: () => new SigaaSessao({ base: f.base, esperarMs: 0 }),
		agora: () => new Date("2026-09-05T12:00:00.000Z"),
		emitir: () => {
			emitidos++;
		},
	});
	return { f, s };
}

const posts = (f: SigaaFalso) => f.pedidos.filter((p) => p.metodo === "POST" && p.caminho.startsWith("/sigaa/logar.do")).length;
const downloads = (f: SigaaFalso) => f.pedidos.filter((p) => p.caminho.startsWith("/sigaa/ava/ArquivoTurma/listar_discente.jsf")).length;

describe("sincronização", () => {
	it("conectar com senha certa grava a conta e monta as turmas", async () => {
		const { s } = await montar();
		const e = await s.conectar("aluno.teste", "segredo");
		assert.equal(e.situacao, "sincronizando");
		await s.emAndamento();
		const turma = bibliotecaStore.readTurma("ICE0001", TURMA);
		assert.ok(turma, "turma montada");
		assert.equal(bibliotecaStore.readMateria("ICE0001")!.nome, "Cálculo Teste");
		assert.ok(bibliotecaStore.readTurma("ICE0002", "2026-2-turma-tb"));
		assert.deepEqual(sigaaStore.readConta(), { usuario: "aluno.teste", senhaCifrada: "teste:segredo" });
		const refs = bibliotecaStore.readReferencias("ICE0001", TURMA);
		assert.equal(refs.arquivos.length, 4);
		assert.deepEqual(refs.arquivos.find((a) => a.sigaaId === "5002")!.topicos, ["regra-da-cadeia"]);
		assert.ok(fs.existsSync(bibliotecaStore.referenciaPath("ICE0001", TURMA, "Exemplos.ipynb.md")));
		const fim = s.estado();
		assert.equal(fim.situacao, "ocioso");
		assert.equal(fim.ultimoSucesso, "2026-09-05T12:00:00.000Z");
		assert.ok(emitidos > 0);
	});

	it("senha errada: 401, nada gravado, um POST de login", async () => {
		const { f, s } = await montar();
		const req = new Request("http://localhost/api/sigaa/conta", { method: "POST", body: JSON.stringify({ usuario: "aluno.teste", senha: "errada" }) });
		const res = await sigaaConectarRoute(req, s);
		assert.equal(res.status, 401);
		assert.equal((await res.json()).error, "O SIGAA recusou o usuário ou a senha.");
		assert.equal(sigaaStore.readConta(), null);
		assert.equal(posts(f), 1);
		assert.equal(fs.existsSync(BIBLIOTECA_DIR), false);
	});

	it("usuário ou senha vazios dão 400", async () => {
		const { s } = await montar();
		const res = await sigaaConectarRoute(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ usuario: " ", senha: "" }) }), s);
		assert.equal(res.status, 400);
		assert.equal((await res.json()).error, "Informe usuário e senha.");
	});

	it("a segunda sincronização não abre notícia nenhuma", async () => {
		const { f, s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		assert.deepEqual(f.noticiasAbertas, ["8001", "8002"]);
		const turma = bibliotecaStore.readTurma("ICE0001", TURMA)!;
		assert.equal(turma.noticias![0]!.texto, "Teremos revisão na sexta, sala 2.");
		assert.equal(turma.tarefas!.length, 2);
		s.sincronizarAgora();
		await s.emAndamento();
		assert.deepEqual(f.noticiasAbertas, ["8001", "8002"], "nenhuma abertura nova");
	});

	it("a segunda sincronização não baixa de novo", async () => {
		const { f, s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		const antes = downloads(f);
		s.sincronizarAgora();
		await s.emAndamento();
		assert.equal(downloads(f), antes);
		assert.equal(posts(f), 2, "um login por sincronização");
	});

	it("mesmo conteúdo com outro id reaproveita o arquivo", async () => {
		const { s } = await montar();
		bibliotecaStore.addReferenciaFile("ICE0001", TURMA, "copia.pdf", new TextEncoder().encode("%PDF-1.4 limites"));
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		const pasta = path.dirname(bibliotecaStore.referenciaPath("ICE0001", TURMA, "copia.pdf"));
		assert.ok(!fs.readdirSync(pasta).includes("Aula_1_Limites.pdf"));
		assert.equal(bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.find((a) => a.sigaaId === "5001")!.arquivo, "copia.pdf");
	});

	it("a data à mão de uma prova do SIGAA volta para a do SIGAA", async () => {
		const { s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		bibliotecaStore.writeTurma("ICE0001", definirDataProva(bibliotecaStore.readTurma("ICE0001", TURMA)!, "sigaa-7001", "2026-09-30"));
		s.sincronizarAgora();
		await s.emAndamento();
		const av = bibliotecaStore.readTurma("ICE0001", TURMA)!.avaliacoes.find((a) => a.id === "sigaa-7001")!;
		assert.equal(av.data, "2026-09-10");
		assert.equal(av.origemData, "sigaa");
		assert.ok(s.estado().avisos.includes("O SIGAA mudou a 2ª unidade de 30/09 para 10/09."), JSON.stringify(s.estado().avisos));
	});

	it("edição durante a sincronização não se perde", async () => {
		let s: Awaited<ReturnType<typeof montar>>["s"] | null = null;
		let editou = false;
		const m = await montar({
			aoServir: (caminho, rotulo) => {
				if (!s || editou || rotulo !== "Arquivos" || caminho !== "/sigaa/ava/index.jsf") return;
				const t = bibliotecaStore.readTurma("ICE0001", TURMA);
				if (!t) return;
				editou = true;
				bibliotecaStore.writeTurma("ICE0001", adicionarProva(t, { nome: "Prova extra", data: "2026-09-25" }));
			},
		});
		await m.s.conectar("aluno.teste", "segredo");
		await m.s.emAndamento();
		s = m.s;
		s.sincronizarAgora();
		await s.emAndamento();
		assert.ok(editou, "a edição aconteceu no meio da leitura");
		const prova = bibliotecaStore.readTurma("ICE0001", TURMA)!.avaliacoes.find((a) => a.id === "prova-extra");
		assert.equal(prova?.data, "2026-09-25");
	});

	it("sessão que cai vira aviso e mantém os dados anteriores da turma", async () => {
		const ok = await montar();
		await ok.s.conectar("aluno.teste", "segredo");
		await ok.s.emAndamento();
		const antes = bibliotecaStore.readTurma("ICE0001", TURMA);
		const { f, s } = await montar({ derrubarSessaoDepois: 3 });
		sigaaStore.writeConta({ usuario: "aluno.teste", senhaCifrada: "teste:segredo" });
		sigaaStore.writeEstado({ situacao: "ocioso", usuario: "aluno.teste", ultimoSucesso: "2026-09-01T08:00:00.000Z", avisos: [] });
		s.sincronizarAgora();
		await s.emAndamento();
		const e = s.estado();
		assert.equal(e.situacao, "erro", "nenhuma turma lida não é sucesso (revisão final, I7)");
		assert.equal(e.erro, "Não consegui ler nenhuma turma do SIGAA nesta sincronização.");
		assert.equal(e.ultimoSucesso, "2026-09-01T08:00:00.000Z", "o último sucesso continua o anterior");
		assert.ok(e.avisos.some((a) => /^Não consegui ler Cálculo Teste: .*sessão/.test(a)), JSON.stringify(e.avisos));
		assert.deepEqual(bibliotecaStore.readTurma("ICE0001", TURMA), antes);
		assert.equal(posts(f), 1);
	});

	it("portal sem turmas é erro, não sucesso (revisão final, I7)", async () => {
		const { s } = await montar({ portalSemTurmas: true });
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		assert.equal(s.estado().situacao, "erro");
		assert.equal(s.estado().erro, "O SIGAA não mostrou nenhuma turma no portal.");
		assert.equal(s.estado().ultimoSucesso, undefined);
	});

	it("Salvar materiais não faz baixar tudo de novo (revisão final, C2)", async () => {
		const { f, s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		const svc = createBibliotecaService({ biblioteca: bibliotecaStore, topicosEmSessoes: () => [] });
		const refs = bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos;
		svc.salvarReferencias("ICE0001", TURMA, { arquivos: refs.map((a) => ({ arquivo: a.arquivo, topicos: a.topicos })) });
		const depois = bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos;
		assert.ok(depois.every((a) => a.sigaaId), JSON.stringify(depois));
		assert.equal(depois.find((a) => a.sigaaId === "5002")!.aula, 4);
		const antes = downloads(f);
		s.sincronizarAgora();
		await s.emAndamento();
		assert.equal(downloads(f), antes);
	});

	it("arquivo que perdeu o sigaaId recupera na sincronização (revisão final, C2)", async () => {
		const { f, s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		const r = bibliotecaStore.readReferencias("ICE0001", TURMA);
		bibliotecaStore.writeReferencias("ICE0001", TURMA, { ...r, arquivos: r.arquivos.map(({ sigaaId: _s, ...a }) => a) });
		s.sincronizarAgora();
		await s.emAndamento();
		assert.ok(bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.every((a) => a.sigaaId));
		const antes = downloads(f);
		s.sincronizarAgora();
		await s.emAndamento();
		assert.equal(downloads(f), antes);
	});

	it("leitura sem nenhum tópico mantém os dados da turma (revisão final, I3)", async () => {
		const ok = await montar();
		await ok.s.conectar("aluno.teste", "segredo");
		await ok.s.emAndamento();
		const antes = bibliotecaStore.readTurma("ICE0001", TURMA);
		const { s } = await montar({ semTopicos: "1001" });
		s.sincronizarAgora();
		await s.emAndamento();
		assert.deepEqual(bibliotecaStore.readTurma("ICE0001", TURMA), antes);
		assert.ok(s.estado().avisos.some((a) => /^Não consegui ler Cálculo Teste: .*nenhum tópico de aula/.test(a)), JSON.stringify(s.estado().avisos));
	});

	it("conectar duas vezes ao mesmo tempo: a segunda recusa (revisão final, I6)", async () => {
		const { f, s } = await montar();
		const p1 = s.conectar("aluno.teste", "segredo");
		await assert.rejects(s.conectar("aluno.teste", "segredo"), SigaaOcupadoError);
		await p1;
		await s.emAndamento();
		assert.equal(posts(f), 1);
	});

	it("duas instâncias com o estado compartilhado veem a mesma sincronização (revisão final, I6)", async () => {
		const compartilhado = { andamento: null as Promise<void> | null };
		const a = await montar({}, compartilhado);
		const b = await montar({}, compartilhado);
		await a.s.conectar("aluno.teste", "segredo");
		assert.equal(b.s.estado().situacao, "sincronizando");
		b.s.sincronizarAgora();
		assert.equal(posts(b.f), 0, "a segunda instância não abre outra sincronização");
		await a.s.emAndamento();
	});

	it("durante a sincronização o estado traz o progresso; no fim, não", async () => {
		const vistos: { fracao: number; texto: string }[] = [];
		let s: Awaited<ReturnType<typeof montar>>["s"] | null = null;
		const m = await montar({
			aoServir: (_c, rotulo) => {
				const p = s?.estado().progresso;
				if (p && rotulo === "download") vistos.push(p);
			},
		});
		s = m.s;
		const e = await s.conectar("aluno.teste", "segredo");
		assert.equal(e.situacao, "sincronizando");
		assert.match(e.progresso!.texto, /^Lendo Cálculo Teste \(turma 1 de 2\)$/);
		await s.emAndamento();
		assert.ok(vistos.length >= 4, JSON.stringify(vistos));
		assert.ok(vistos.some((p) => /baixando arquivo 2 de 4 \(turma 1 de 2\)/.test(p.texto)), JSON.stringify(vistos));
		assert.ok(vistos.every((p, i) => p.fracao > 0 && p.fracao < 1 && (i === 0 || p.fracao >= vistos[i - 1]!.fracao)), "a barra só anda para a frente");
		assert.equal(s.estado().progresso, undefined);
	});

	it("começar uma sincronização limpa os avisos da anterior", async () => {
		const { s } = await montar();
		sigaaStore.writeConta({ usuario: "aluno.teste", senhaCifrada: "teste:segredo" });
		sigaaStore.writeEstado({ situacao: "erro", usuario: "aluno.teste", erro: "falhou antes", avisos: ["Não consegui ler Cálculo Teste: antigo."] });
		const e = s.sincronizarAgora();
		assert.equal(e.situacao, "sincronizando");
		assert.deepEqual(e.avisos, []);
		assert.equal(e.erro, undefined);
		await s.emAndamento();
	});

	it("um arquivo que falha ao gravar vira aviso e não derruba a turma (revisão final, #11)", async () => {
		const falha = { ...bibliotecaStore, addReferenciaFile: (c: string, t: string, nome: string, bytes: Uint8Array) => {
			if (nome.startsWith("Ficha")) throw new Error("disco cheio");
			return bibliotecaStore.addReferenciaFile(c, t, nome, bytes);
		} };
		const { s } = await montar({}, undefined, { biblioteca: falha });
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		assert.equal(s.estado().situacao, "ocioso");
		assert.ok(s.estado().avisos.includes('Não consegui guardar "Ficha de avaliação.docx" de Cálculo Teste: disco cheio'), JSON.stringify(s.estado().avisos));
		assert.equal(bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.length, 3);
		assert.ok(bibliotecaStore.readTurma("ICE0001", TURMA));
	});

	it("arquivo grande é baixado uma vez, guardado e não é baixado de novo (pedido do dono)", async () => {
		const { f, s } = await montar({ arquivoGrande: true });
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		const grande = bibliotecaStore.readReferencias("ICE0001", TURMA).arquivos.find((a) => a.sigaaId === "5001")!;
		assert.ok(grande, "o arquivo grande está nos materiais");
		assert.equal(fs.statSync(bibliotecaStore.referenciaPath("ICE0001", TURMA, grande.arquivo)).size, 27 * 1024 * 1024);
		assert.ok(!s.estado().avisos.some((a) => /grande/.test(a)), JSON.stringify(s.estado().avisos));
		const antes = downloads(f);
		s.sincronizarAgora();
		await s.emAndamento();
		assert.equal(downloads(f), antes, "nenhum download repetido");
	});

	it("Sair da conta durante a sincronização vale: a leitura para e nada mais é gravado (revisão final, #9)", async () => {
		const { f, s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		const e = s.sair();
		assert.equal(e.situacao, "sem-conta");
		await s.emAndamento();
		assert.equal(s.estado().situacao, "sem-conta");
		assert.equal(sigaaStore.readEstado().usuario, undefined, "o fim da leitura não regrava 'Conectado como'");
		assert.equal(sigaaStore.readConta(), null);
		assert.equal(bibliotecaStore.readTurma("ICE0002", "2026-2-turma-tb"), null, "a leitura parou antes da 2ª turma");
		assert.ok(f.pedidos.some((p) => p.caminho.startsWith("/sigaa/logar.do?dispatch=logOff")), "sai da conta no SIGAA também");
	});

	it("senha guardada recusada: senha-recusada e não tenta de novo", async () => {
		const { f, s } = await montar();
		sigaaStore.writeConta({ usuario: "aluno.teste", senhaCifrada: "teste:antiga" });
		s.sincronizarAgora();
		await s.emAndamento();
		assert.equal(s.estado().situacao, "senha-recusada");
		assert.equal(s.estado().erro, "O SIGAA recusou a senha guardada. Conecte a conta de novo.");
		s.sincronizarAgora();
		assert.equal(s.emAndamento(), null);
		assert.equal(posts(f), 1);
	});

	it("sincronizarAgora com outra rodando não abre a segunda", async () => {
		const { f, s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		const primeira = s.emAndamento();
		s.sincronizarAgora();
		assert.equal(s.emAndamento(), primeira);
		await primeira;
		assert.equal(posts(f), 1);
	});

	it("sem conta, sincronizarAgora pede para conectar", async () => {
		const { s } = await montar();
		const e = s.sincronizarAgora();
		assert.equal(e.situacao, "sem-conta");
		assert.deepEqual(e.avisos, ["Conecte sua conta UFJ primeiro."]);
	});

	it("rotas: GET devolve o estado; POST sincronizar dá 202; DELETE apaga a conta", async () => {
		const { s } = await montar();
		await s.conectar("aluno.teste", "segredo");
		await s.emAndamento();
		assert.equal((await sigaaEstadoRoute(s).json()).situacao, "ocioso");
		const r = sigaaSincronizarRoute(s);
		assert.equal(r.status, 202);
		await s.emAndamento();
		const d = sigaaSairRoute(s);
		assert.equal((await d.json()).situacao, "sem-conta");
		assert.equal(sigaaStore.readConta(), null);
		assert.ok(bibliotecaStore.readTurma("ICE0001", TURMA), "os dados baixados ficam");
	});
});
