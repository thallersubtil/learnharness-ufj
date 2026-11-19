/** GET/PUT /api/biblioteca/materias/[codigo] — ler e editar uma matéria (spec Etapa A §7.3). */
import { materiaGetRoute, materiaPutRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
	const { codigo } = await params;
	return materiaGetRoute(codigo);
}

export async function PUT(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
	const { codigo } = await params;
	return materiaPutRoute(request, codigo);
}
