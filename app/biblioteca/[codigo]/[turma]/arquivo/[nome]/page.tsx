import { ArquivoScreen } from "@/components/biblioteca/arquivo-view";

export const dynamic = "force-dynamic";

export default async function ArquivoPage({ params }: { params: Promise<{ codigo: string; turma: string; nome: string }> }) {
	const { codigo, turma, nome } = await params;
	return <ArquivoScreen codigo={decodeURIComponent(codigo)} turmaId={decodeURIComponent(turma)} nome={decodeURIComponent(nome)} />;
}
