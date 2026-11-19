import type { ChatListItem, LhMarkerMessage, UfjContextRef } from "@/src/core";
import {
	compactionInFlight,
	createChat,
	graphContextMessageFor,
	isTurnRunning,
	listChats,
	parseUfjContextRef,
	practicePicksForTopico,
	readSettingsRecord,
	respostaDeErro,
	sanitizeGraphPicks,
	stores,
	titleFromPrompt,
	ufjMarkerFor,
} from "@/src/server";

/** The session picker's list: record-derived summaries (phase, pending
 *  question) + live liveness — a running turn marks the session busy
 *  (contracts.ts ChatListItem; the store can't see liveness, the route is
 *  the merge point). Owner, minimal-color round: background jobs NO LONGER
 *  count — the sidebar's Background agents section is their channel now
 *  (a running spinner per row would double-signal them), so busy means
 *  exactly "a teach turn is in flight". */
export async function GET() {
	const chats: ChatListItem[] = listChats().map((c) => ({
		...c,
		busy: isTurnRunning(c.id),
		compacting: compactionInFlight(c.id),
	}));
	return Response.json({ chats });
}

export async function POST(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { title?: unknown; kind?: unknown; graphContext?: unknown; ufjContext?: unknown };
	const title = typeof body.title === "string" ? body.title : "";
	// Practice sessions (owner, 2026-10-04): kind "practice" marks the
	// record — the practice agent + its tools from turn 1, no extraction.
	const kind = body.kind === "practice" ? ("practice" as const) : undefined;
	// UFJ library sessions (spec Etapa A §7.6): the ufj-context marker is
	// built BEFORE the chat exists, so an unknown/archived topic refuses with
	// 400 and leaves no empty session behind.
	let ufjMarker: LhMarkerMessage | undefined;
	let ufjRef: UfjContextRef | undefined;
	if (body.ufjContext !== undefined) {
		try {
			ufjRef = parseUfjContextRef(body.ufjContext);
			ufjMarker = ufjMarkerFor(ufjRef);
		} catch (err) {
			return respostaDeErro(err);
		}
	}
	const chat = createChat(titleFromPrompt(title || "Untitled session"), kind);
	// PER-SESSION MODELS (owner, 2026-09-28): a session owns its model +
	// thinking level from birth — stamped verbatim from the STRONG slot,
	// the new-session default. From here the strong slot never reaches
	// this session again: in-session picks write the session's own record
	// (PUT /api/chats/:id/settings). No strong slot configured (fresh BYOK
	// boot) → no stamp; the turn gate's 503 models_not_configured envelope
	// refuses honestly until the setup flow fills the slot.
	const strong = readSettingsRecord()?.models?.strong;
	if (strong?.model) {
		stores.chatStore.saveSettings(chat.id, {
			model: { provider: strong.model.provider, id: strong.model.id },
			thinkingLevel: strong.thinkingLevel,
		});
	}
	// The session's map context (owner, 2026-10-04): the picked
	// propositions ride the CREATION — a graph-context marker (a separate
	// custom message BEFORE the learner's first user message), carrying the
	// picks plus the reasoning chains among them. A library practice session
	// with no explicit picks starts from the propositions its topic's
	// sessions produced. Both markers are written in ONE save (ufj first).
	let picks = sanitizeGraphPicks((body.graphContext as { propositions?: unknown } | undefined)?.propositions);
	if (picks.length === 0 && kind === "practice" && ufjRef) picks = practicePicksForTopico(ufjRef);
	const markers: LhMarkerMessage[] = [];
	if (ufjMarker) markers.push(ufjMarker);
	if (picks.length > 0) markers.push(graphContextMessageFor(picks));
	if (markers.length > 0) stores.chatStore.saveMessages(chat.id, markers);
	return Response.json({ id: chat.id, title: chat.title });
}
