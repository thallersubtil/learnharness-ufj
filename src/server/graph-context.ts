/**
 * The session's map context marker (owner, 2026-10-04), extracted from
 * POST /api/chats so library sessions (spec Etapa A §7.6) build it the same
 * way: at most 64 picks, plus the reasoning chains among them from the
 * CURRENT graph. The picks keep their own name/statement (what was picked).
 */

import { chainsForSelection, formatChainLine } from "../core/chains.ts";
import { newGraphContextMessage, type GraphContextPick, type LhMarkerMessage } from "../core/native-messages.ts";
import { stores } from "./stores.ts";

export const GRAPH_CONTEXT_PICK_LIMIT = 64;

/** Keep only well-formed picks, capped at the limit. */
export function sanitizeGraphPicks(raw: unknown): GraphContextPick[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(p): p is GraphContextPick =>
				typeof p === "object" &&
				p !== null &&
				typeof (p as GraphContextPick).id === "string" &&
				typeof (p as GraphContextPick).name === "string" &&
				typeof (p as GraphContextPick).statement === "string",
		)
		.slice(0, GRAPH_CONTEXT_PICK_LIMIT);
}

/** The graph-context marker for these picks (chains derived from the current graph). */
export function graphContextMessageFor(picks: readonly GraphContextPick[]): LhMarkerMessage {
	const capped = picks.slice(0, GRAPH_CONTEXT_PICK_LIMIT);
	const byId = new Map(stores.graphStore.readNodes().map((n) => [n.id, n]));
	const pickedNodes = capped.map((p) => byId.get(p.id)).filter((n) => n !== undefined);
	const chainLines = chainsForSelection(pickedNodes, stores.graphStore.readChains()).map((c) => formatChainLine(c, Object.fromEntries(byId)));
	return newGraphContextMessage(capped, chainLines);
}
