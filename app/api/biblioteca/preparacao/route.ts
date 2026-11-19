/**
 * Tela de preparação (spec Etapa A §7.5).
 * GET — ?materia=&turma=&avaliacao= → a view (tópicos, sinais, próximos passos).
 * PUT — `{materia, turma, avaliacao, horas}` → grava as horas disponíveis (estudo pessoal).
 */
import { preparacaoGetRoute, preparacaoPutRoute } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	return preparacaoGetRoute(request);
}

export async function PUT(request: Request) {
	return preparacaoPutRoute(request);
}
