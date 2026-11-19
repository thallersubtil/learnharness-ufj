/**
 * Materiais da turma (spec Etapa A §7.4).
 * POST — multipart `arquivos`: copia para a biblioteca e devolve sugestões de tópico.
 * PUT  — JSON `{ arquivos }`: grava o mapeamento arquivo → tópicos, depois da revisão.
 */
import { materiaisPostRoute, materiaisPutRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ codigo: string; turma: string }> }) {
	const { codigo, turma } = await params;
	return materiaisPostRoute(request, codigo, turma);
}

export async function PUT(request: Request, { params }: { params: Promise<{ codigo: string; turma: string }> }) {
	const { codigo, turma } = await params;
	return materiaisPutRoute(request, codigo, turma);
}
