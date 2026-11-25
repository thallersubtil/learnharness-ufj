/** GET /api/biblioteca/materias/[codigo]/turmas/[turma]/arquivos/[nome] — o arquivo da turma, para abrir dentro do app (spec chat+SIGAA §5.5). */
import { arquivoGetRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string; turma: string; nome: string }> }) {
	const { codigo, turma, nome } = await params;
	return arquivoGetRoute(decodeURIComponent(codigo), decodeURIComponent(turma), decodeURIComponent(nome));
}
