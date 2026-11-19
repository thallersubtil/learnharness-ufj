/** GET /api/biblioteca — matérias com suas turmas e os problemas de leitura (spec Etapa A §7.1). */
import { listarRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return listarRoute();
}
