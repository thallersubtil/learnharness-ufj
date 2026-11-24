/** PUT /api/biblioteca/materias/[codigo]/turmas/[turma]/avaliacoes/[avaliacao] — data e conteúdo da prova (spec SIGAA §7.5–7.6). */
import { provaPutRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ codigo: string; turma: string; avaliacao: string }> }) {
	const { codigo, turma, avaliacao } = await params;
	return provaPutRoute(request, codigo, turma, avaliacao);
}
