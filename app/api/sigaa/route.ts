/** GET /api/sigaa — o estado da conta UFJ e da última sincronização (spec SIGAA §7.2). */
import { sigaaEstadoRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return sigaaEstadoRoute();
}
