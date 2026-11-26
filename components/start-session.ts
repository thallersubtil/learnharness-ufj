import { clearOpeningPrompt, OPENING_PROMPT_FAILURE, stashOpeningPrompt } from "./opening-prompt";

interface SessionCreation {
	title: string;
	kind?: "practice";
	graphContext?: { propositions: readonly { id: string; name: string; statement: string }[] };
	/** UFJ library link (spec Etapa A §7.6): the server writes the ufj-context marker. */
	ufjContext?: { materia: string; turma: string; avaliacao?: string; topico?: string; origem?: "topico" | "material" | "prova"; arquivo?: string };
	/** Fill the new session's composer with this text WITHOUT sending it. */
	prefill?: string;
}

/** Per source-composer instance. Retain a successful creation if storage
 * fails, so an unchanged retry does not create another empty session.
 * Changed text/context/settings is a different start, not a stale title.
 */
export class SessionStarter {
	private created?: { identity: string; id: string };

	async start(body: SessionCreation, fetchLike: typeof fetch, settingsIdentity?: string): Promise<string> {
		const identity = JSON.stringify([body, settingsIdentity]);
		if (this.created?.identity !== identity) {
			if (this.created) clearOpeningPrompt(this.created.id);
			this.created = undefined;
			const { prefill: _prefill, ...creation } = body;
			const res = await fetchLike("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(creation),
			});
			if (!res.ok) throw new Error(OPENING_PROMPT_FAILURE);
			const result = await res.json() as { id?: unknown };
			if (typeof result.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(result.id)) throw new Error(OPENING_PROMPT_FAILURE);
			this.created = { identity, id: result.id };
		}
		// prefill: stashed as already attempted — the chat fills the composer
		// with it instead of auto-sending (chat.tsx opening-prompt effect).
		const opening = body.prefill !== undefined ? stashOpeningPrompt(this.created.id, body.prefill, true) : stashOpeningPrompt(this.created.id, body.title);
		if (!opening) throw new Error(OPENING_PROMPT_FAILURE);
		return `/chat/${this.created.id}`;
	}
}
