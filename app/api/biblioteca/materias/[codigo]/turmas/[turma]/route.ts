/** GET/PUT /api/biblioteca/materias/[codigo]/turmas/[turma] — ler e editar uma turma (spec Etapa A §7.3). */
import { turmaGetRoute, turmaPutRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string; turma: string }> }) {
	const { codigo, turma } = await params;
	return turmaGetRoute(codigo, turma);
}

export async function PUT(request: Request, { params }: { params: Promise<{ codigo: string; turma: string }> }) {
	const { codigo, turma } = await params;
	return turmaPutRoute(request, codigo, turma);
}
