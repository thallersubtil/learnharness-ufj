/** POST /api/biblioteca/materias/[codigo]/turmas/[turma]/avaliacoes — adicionar uma prova (spec SIGAA §7.5). */
import { provaPostRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ codigo: string; turma: string }> }) {
	const { codigo, turma } = await params;
	return provaPostRoute(request, codigo, turma);
}
