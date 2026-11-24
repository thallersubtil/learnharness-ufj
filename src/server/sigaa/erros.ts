/** Erros do leitor do SIGAA, com mensagens em português para a tela. */

export class SigaaSenhaRecusadaError extends Error {
	constructor(message = "O SIGAA recusou o usuário ou a senha.") {
		super(message);
		this.name = "SigaaSenhaRecusadaError";
	}
}

export class SigaaIndisponivelError extends Error {
	constructor(message = "Não consegui falar com o SIGAA agora. Tente de novo mais tarde.") {
		super(message);
		this.name = "SigaaIndisponivelError";
	}
}

export class SigaaEstruturaError extends Error {
	constructor(onde: string) {
		super(`O SIGAA mudou de um jeito que o app não entende: ${onde}.`);
		this.name = "SigaaEstruturaError";
	}
}

export class SigaaSessaoExpiradaError extends Error {
	constructor(message = "A sessão do SIGAA caiu no meio da leitura.") {
		super(message);
		this.name = "SigaaSessaoExpiradaError";
	}
}
