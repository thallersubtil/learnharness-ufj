import { ArquivoScreen } from "@/components/biblioteca/arquivo-view";

export const dynamic = "force-dynamic";

export default async function ArquivoPage({ params }: { params: Promise<{ codigo: string; turma: string; nome: string }> }) {
	const { codigo, turma, nome } = await params;
	// O Next já entrega os parâmetros decodificados.
	return <ArquivoScreen codigo={codigo} turmaId={turma} nome={nome} />;
}
