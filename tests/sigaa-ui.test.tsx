/** Tela Conta UFJ, cartão do SIGAA na tela Matérias e o nome "Matérias" na
 * barra lateral (spec SIGAA §7.2, §7.7). Renderizadas no servidor; dados fictícios. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CartaoSigaa, ContaUfj } from "../components/sigaa/conta-ufj.tsx";
import { BibliotecaHome } from "../components/biblioteca/biblioteca-home.tsx";
import { BibliotecaNavButton } from "../components/sidebar.tsx";
import type { EstadoSigaa } from "../src/core/index.ts";

const noop = () => {};
const conta = (estado: EstadoSigaa, extra: { ocupado?: boolean; erro?: string | null } = {}) =>
	renderToStaticMarkup(<ContaUfj estado={estado} ocupado={extra.ocupado ?? false} erro={extra.erro ?? null} onConectar={noop} onSincronizar={noop} onSair={noop} />);
const OCIOSO: EstadoSigaa = { situacao: "ocioso", usuario: "aluno.teste", ultimoSucesso: "2026-09-05T15:00:00.000Z", avisos: [] };

describe("Conta UFJ", () => {
	it("sem conta mostra o formulário com campo de senha", () => {
		const html = conta({ situacao: "sem-conta", avisos: [] });
		assert.match(html, /Conta UFJ \(SIGAA\)/);
		assert.match(html, /Usuário do Login Único/);
		assert.match(html, /type="password"/);
		assert.match(html, /autoComplete="current-password"|autocomplete="current-password"/);
		assert.match(html, />Entrar</);
		assert.doesNotMatch(html, /Sair da conta/);
	});

	it("conectado mostra usuário, última sincronização e os botões", () => {
		const html = conta(OCIOSO);
		assert.match(html, /Conectado como <strong>aluno\.teste<\/strong>/);
		assert.match(html, /Última sincronização: 05\/09\/2026/);
		assert.match(html, />Sincronizar agora</);
		assert.match(html, />Sair da conta</);
		assert.doesNotMatch(html, /type="password"/);
	});

	it("sincronizando desabilita o botão", () => {
		const html = conta({ ...OCIOSO, situacao: "sincronizando" });
		assert.match(html, /Sincronizando com o SIGAA…/);
		assert.match(html, /<button[^>]*disabled=""[^>]*>Sincronizar agora<\/button>/);
	});

	it("senha recusada mostra o aviso e o formulário", () => {
		const html = conta({ ...OCIOSO, situacao: "senha-recusada", erro: "O SIGAA recusou a senha guardada. Conecte a conta de novo." });
		assert.match(html, /O SIGAA recusou a senha guardada\. Conecte a conta de novo\./);
		assert.match(html, /type="password"/);
	});

	it("erro de rede aparece e os avisos da última sincronização também", () => {
		const html = conta({ ...OCIOSO, situacao: "erro", erro: "Não consegui falar com o SIGAA agora. Tente de novo mais tarde.", avisos: ["Não consegui ler Cálculo Teste: seção Avaliações."] });
		assert.match(html, /Não consegui falar com o SIGAA agora/);
		assert.match(html, /Não consegui ler Cálculo Teste/);
	});
});

describe("cartão do SIGAA na tela Matérias", () => {
	it("a home mostra o cartão sem conta com link para /conta-ufj", () => {
		const html = renderToStaticMarkup(<BibliotecaHome materias={[]} problemas={[]} hoje={new Date(2026, 10, 18)} sigaa={{ situacao: "sem-conta", avisos: [] }} />);
		assert.match(html, /Conecte sua conta UFJ para montar as matérias pelo SIGAA\./);
		assert.match(html, /href="\/conta-ufj"/);
		assert.match(html, /Nenhuma matéria ainda\. Conecte sua conta UFJ ou importe um plano de ensino\./);
	});

	it("o cartão mostra os avisos da última sincronização e a senha recusada", () => {
		const avisos = renderToStaticMarkup(<CartaoSigaa estado={{ ...OCIOSO, avisos: ["O SIGAA mudou a 2ª unidade de 01/12 para 03/12."] }} onSincronizar={noop} />);
		assert.match(avisos, /O SIGAA mudou a 2ª unidade de 01\/12 para 03\/12\./);
		assert.match(avisos, /Última sincronização: 05\/09\/2026/);
		assert.match(avisos, />Sincronizar agora</);
		const recusada = renderToStaticMarkup(<CartaoSigaa estado={{ ...OCIOSO, situacao: "senha-recusada" }} onSincronizar={noop} />);
		assert.match(recusada, /O SIGAA recusou a senha guardada\. Conecte a conta de novo\./);
		assert.match(recusada, /href="\/conta-ufj"/);
	});
});

describe("barra lateral", () => {
	it("a barra lateral diz Matérias", () => {
		const html = renderToStaticMarkup(<BibliotecaNavButton active={false} onClick={noop} />);
		assert.match(html, />Matérias</);
		assert.doesNotMatch(html, /Biblioteca/);
	});
});
