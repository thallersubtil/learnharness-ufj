/**
 * CIFRAR E DECIFRAR A SENHA DO SIGAA (spec SIGAA §7.2). No app de desktop, o
 * processo principal do Electron cifra com o chaveiro do sistema, pelo canal
 * IPC "lh:segredo" (electron/segredo-ipc.cjs). Fora do desktop só existe um
 * modo de desenvolvimento explícito (`LH_SIGAA_SENHA_DEV=1`), que o app
 * empacotado nunca usa.
 */

export class SigaaSegredoIndisponivelError extends Error {
	constructor(message = "Guardar a senha só funciona no app de desktop.") {
		super(message);
		this.name = "SigaaSegredoIndisponivelError";
	}
}

const CANAL = "lh:segredo";
const TIMEOUT_MS = 10_000;
const KEY = Symbol.for("lh.sigaa.segredo");

interface Pendente {
	op: string;
	resolve(v: string): void;
	reject(e: Error): void;
	timer: ReturnType<typeof setTimeout>;
}
interface Estado {
	pendentes: Map<string, Pendente>;
	contador: number;
}

function desktopConectado(): boolean {
	return process.env.LH_DESKTOP_SERVER === "1" && (process.env.LH_DESKTOP_API_SECRET?.length ?? 0) >= 64 && typeof process.send === "function" && process.connected === true;
}

const modoDev = () => process.env.LH_SIGAA_SENHA_DEV === "1" && process.env.LH_DESKTOP_SERVER !== "1";

function ponte(): Estado {
	const g = globalThis as typeof globalThis & { [KEY]?: Estado };
	if (!g[KEY]) {
		const estado: Estado = { pendentes: new Map(), contador: 0 };
		g[KEY] = estado;
		process.on("message", (raw: unknown) => {
			const m = raw as { channel?: string; id?: string; op?: string; ok?: boolean; value?: unknown; error?: unknown } | null;
			if (!m || m.channel !== CANAL || !m.id) return;
			const p = estado.pendentes.get(m.id);
			if (!p || p.op !== m.op) return;
			clearTimeout(p.timer);
			estado.pendentes.delete(m.id);
			if (m.ok && typeof m.value === "string") p.resolve(m.value);
			else p.reject(new SigaaSegredoIndisponivelError(typeof m.error === "string" ? m.error : "O chaveiro do sistema não está disponível."));
		});
	}
	return g[KEY];
}

function pedir(op: "cifrar" | "decifrar", campos: Record<string, string>): Promise<string> {
	const estado = ponte();
	const id = `s${++estado.contador}`;
	return new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => {
			estado.pendentes.delete(id);
			reject(new SigaaSegredoIndisponivelError("O chaveiro do sistema não respondeu."));
		}, TIMEOUT_MS);
		estado.pendentes.set(id, { op, resolve, reject, timer });
		try {
			process.send!({ channel: CANAL, id, op, ...campos });
		} catch {
			clearTimeout(timer);
			estado.pendentes.delete(id);
			reject(new SigaaSegredoIndisponivelError());
		}
	});
}

export async function cifrarSegredo(texto: string): Promise<string> {
	if (desktopConectado()) return pedir("cifrar", { texto });
	if (modoDev()) return `dev:${Buffer.from(texto, "utf8").toString("base64")}`;
	throw new SigaaSegredoIndisponivelError();
}

export async function decifrarSegredo(cifrado: string): Promise<string> {
	if (desktopConectado()) return pedir("decifrar", { cifrado });
	if (modoDev() && cifrado.startsWith("dev:")) return Buffer.from(cifrado.slice(4), "base64").toString("utf8");
	throw new SigaaSegredoIndisponivelError();
}
