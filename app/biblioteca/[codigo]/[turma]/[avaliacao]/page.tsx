import { PreparacaoScreen } from "@/components/biblioteca/preparacao-view";

export const dynamic = "force-dynamic";

export default async function PreparacaoPage({ params }: { params: Promise<{ codigo: string; turma: string; avaliacao: string }> }) {
	const { codigo, turma, avaliacao } = await params;
	return <PreparacaoScreen codigo={decodeURIComponent(codigo)} turmaId={decodeURIComponent(turma)} avaliacaoId={decodeURIComponent(avaliacao)} />;
}
