"use strict";
/**
 * SENHA DO SIGAA NO CHAVEIRO (spec SIGAA §7.2). O servidor do app é um
 * processo Node filho e não alcança o `safeStorage` do Electron (a chave fica
 * no chaveiro do macOS). Ele pede aqui, pelo canal IPC "lh:segredo", para
 * cifrar ou decifrar um texto; só o texto cifrado (base64) vai para o disco.
 */
const CANAL = "lh:segredo";
const INDISPONIVEL = "O chaveiro do sistema não está disponível.";

/** `safeStorage` vem do Electron aqui, e não do main.cjs: a conexão do ChatGPT
 *  no main.cjs não depende do chaveiro, e um teste garante isso. */
function attachSegredoChild(child, safeStorage = require("electron").safeStorage) {
	let disposed = false;
	const send = (packet) => {
		if (disposed || !child.connected) return;
		try {
			child.send(packet, () => {});
		} catch {
			/* o filho saiu */
		}
	};
	const listener = (message) => {
		if (disposed || !message || message.channel !== CANAL || typeof message.id !== "string") return;
		const { id, op } = message;
		try {
			if (!safeStorage || !safeStorage.isEncryptionAvailable()) throw new Error(INDISPONIVEL);
			if (op === "cifrar" && typeof message.texto === "string") {
				send({ channel: CANAL, id, op, ok: true, value: safeStorage.encryptString(message.texto).toString("base64") });
			} else if (op === "decifrar" && typeof message.cifrado === "string") {
				send({ channel: CANAL, id, op, ok: true, value: safeStorage.decryptString(Buffer.from(message.cifrado, "base64")) });
			} else throw new Error(INDISPONIVEL);
		} catch {
			send({ channel: CANAL, id, op, ok: false, error: INDISPONIVEL });
		}
	};
	child.on("message", listener);
	return {
		dispose() {
			disposed = true;
			child.removeListener("message", listener);
		},
	};
}

module.exports = { attachSegredoChild };
