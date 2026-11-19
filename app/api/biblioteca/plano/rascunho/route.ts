/**
 * POST /api/biblioteca/plano/rascunho — o PDF do plano de ensino (campo
 * multipart `plano`) vira um RASCUNHO estruturado para revisão. Nada é gravado
 * na biblioteca aqui (spec Etapa A §7.3).
 */
import { rascunhoRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	return rascunhoRoute(request);
}
