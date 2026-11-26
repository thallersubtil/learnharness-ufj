/** POST/DELETE /api/sigaa/conta — conectar ou sair da conta UFJ (spec SIGAA §7.2). */
import { sigaaConectarRoute, sigaaSairRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	return sigaaConectarRoute(request);
}

export async function DELETE() {
	return sigaaSairRoute();
}
