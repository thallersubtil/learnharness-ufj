/**
 * POST /api/biblioteca/plano — grava um plano REVISADO: multipart `dados`
 * (JSON {materia, turma, substituir}) e `plano` (o PDF original). 409 quando a
 * turma já existe e `substituir` não veio (spec Etapa A §7.3, passos 4–5).
 */
import { salvarPlanoRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	return salvarPlanoRoute(request);
}
