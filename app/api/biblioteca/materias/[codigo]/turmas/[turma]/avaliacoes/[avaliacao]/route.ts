/** PUT/DELETE /api/biblioteca/materias/[codigo]/turmas/[turma]/avaliacoes/[avaliacao] — nome, data e conteúdo da prova; apagar prova à mão (spec SIGAA §7.5–7.6). */
import { provaDeleteRoute, provaPutRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ codigo: string; turma: string; avaliacao: string }> }) {
	const { codigo, turma, avaliacao } = await params;
	return provaPutRoute(request, codigo, turma, avaliacao);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ codigo: string; turma: string; avaliacao: string }> }) {
	const { codigo, turma, avaliacao } = await params;
	return provaDeleteRoute(codigo, turma, avaliacao);
}
