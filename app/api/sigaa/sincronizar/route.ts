/** POST /api/sigaa/sincronizar — sincronizar agora com o SIGAA (spec SIGAA §7.3). */
import { sigaaSincronizarRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST() {
	return sigaaSincronizarRoute();
}
