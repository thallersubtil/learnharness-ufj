/** "Conteúdo da prova" com cliques rápidos (revisão final, #13): dois cliques
 * seguidos, sem esperar a tela recarregar, não podem desfazer um ao outro.
 * DOM do linkedom, como os outros testes de interação. Dados fictícios. */
import React, { act } from "react";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ProvasSigaa } from "../components/biblioteca/provas-sigaa.tsx";
import { criarFila } from "../components/biblioteca/comum.tsx";
import { montarDoSigaa } from "../src/core/index.ts";
import { installModalDom } from "./modal-dom.ts";

let root: Root | null = null;
let restore = () => {};
afterEach(() => {
	act(() => root?.unmount());
	root = null;
	restore();
});

function dom() {
	const d = parseHTML("<html><head></head><body><div id='root'></div></body></html>");
	// O Link do Next usa self e requestIdleCallback para pré-carregar a rota.
	const globals = {
		React, window: d.window, document: d.document, Element: d.window.Element, HTMLElement: d.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
		self: d.window, requestIdleCallback: (cb: () => void) => setTimeout(cb, 0), cancelIdleCallback: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
	};
	const saved = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
	Object.assign(globalThis, globals);
	const restoreModal = installModalDom(d);
	restore = () => {
		restoreModal();
		for (const [key, descriptor] of saved) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	};
	return d;
}

function turma() {
	return montarDoSigaa(
		{
			idTurma: "1001", codigo: "ICE0001", nome: "DISCIPLINA TESTE", semestre: "2026-2", sufixo: "TA",
			topicos: [
				{ titulo: "Limites", inicio: "2026-09-01", fim: "2026-09-01", descricao: "" },
				{ titulo: "Avaliação da aprendizagem", inicio: "2026-09-03", fim: "2026-09-03", descricao: "" },
				{ titulo: "Regra da cadeia", inicio: "2026-09-04", fim: "2026-09-04", descricao: "" },
			],
			avaliacoes: [{ sigaaId: "999", data: "2026-09-10", descricao: "2ª unidade" }],
			arquivos: [],
		},
		{ materia: null, turma: null, referencias: { formato: 1, arquivos: [] } },
		"2026-09-01T12:00:00.000Z",
	);
}

/** Como um clique de verdade num checkbox: o navegador troca o "checked" antes do evento. */
function clicarCaixa(d: ReturnType<typeof parseHTML>, seletor: string) {
	const caixa = d.document.querySelector(seletor) as unknown as HTMLInputElement;
	assert.ok(caixa, seletor);
	// No linkedom, "checked" é uma propriedade simples (o React não a rastreia), então basta trocar.
	caixa.checked = !caixa.checked;
	caixa.dispatchEvent(new d.window.Event("click", { bubbles: true }));
}

describe("conteúdo da prova com cliques rápidos", () => {
	it("o segundo clique parte da escolha do primeiro, não da tela antiga", async () => {
		const d = dom();
		const m = turma();
		const chamadas: string[][] = [];
		root = createRoot(d.document.getElementById("root") as unknown as Element);
		await act(async () => {
			root!.render(
				<ProvasSigaa materia={m.materia} turma={m.turma} hoje={new Date(2026, 8, 5)} onData={() => {}} onAdicionar={() => {}} onRenomear={() => {}} onApagar={() => {}} onEscopo={(_id, t) => chamadas.push(t)} />,
			);
		});
		await act(async () => clicarCaixa(d, '[data-escopo="sigaa-999:limites"]'));
		await act(async () => clicarCaixa(d, '[data-escopo="sigaa-999:regra-da-cadeia"]'));
		assert.deepEqual(chamadas, [["regra-da-cadeia", "limites"], ["limites"]]);
	});
});

describe("fila de mudanças", () => {
	it("uma mudança só começa quando a anterior termina", async () => {
		const fila = criarFila();
		const ordem: string[] = [];
		let soltar!: () => void;
		const primeira = fila(async () => {
			ordem.push("1 começou");
			await new Promise<void>((r) => (soltar = r));
			ordem.push("1 terminou");
		});
		const segunda = fila(async () => {
			ordem.push("2 começou");
		});
		await new Promise((r) => setTimeout(r, 10));
		assert.deepEqual(ordem, ["1 começou"]);
		soltar();
		await Promise.all([primeira, segunda]);
		assert.deepEqual(ordem, ["1 começou", "1 terminou", "2 começou"]);
	});

	it("um erro numa mudança não trava as seguintes", async () => {
		const fila = criarFila();
		const r = fila(async () => {
			throw new Error("falhou");
		});
		await assert.rejects(r, /falhou/);
		let rodou = false;
		await fila(async () => {
			rodou = true;
		});
		assert.ok(rodou);
	});
});
