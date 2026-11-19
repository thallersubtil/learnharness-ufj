import { TurmaScreen } from "@/components/biblioteca/turma-view";

export const dynamic = "force-dynamic";

export default async function TurmaPage({ params }: { params: Promise<{ codigo: string; turma: string }> }) {
	const { codigo, turma } = await params;
	return <TurmaScreen codigo={decodeURIComponent(codigo)} turmaId={decodeURIComponent(turma)} />;
}
