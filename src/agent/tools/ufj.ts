/**
 * A FERRAMENTA `ufj` (spec chat+SIGAA §5.3): a IA consulta as matérias, as
 * provas, as tarefas, as notícias e os arquivos do professor que o app
 * sincronizou do SIGAA. Só leitura; nada de rede. Quem lê a biblioteca é o
 * servidor, por estas closures — a camada do agente não importa o store.
 */

import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { capOutput, formatSize, MAX_OUTPUT_BYTES } from "./fs-shared.ts";

export interface UfjToolDeps {
	/** Uma linha por turma visível (a do SIGAA por matéria), com as provas. */
	materias(): string;
	/** Tópicos, provas, tarefas, notícias e arquivos (com caminho) de uma matéria; null se não existe. */
	materia(codigo: string): string | null;
	/** O texto completo de uma notícia; null se não existe. */
	noticia(codigo: string, sigaaId: string): string | null;
}

const ufjInput = Type.Object({
	acao: Type.Union([Type.Literal("materias"), Type.Literal("materia"), Type.Literal("noticia")], {
		description: "materias: as matérias do semestre com as provas. materia: tópicos, provas, tarefas, notícias e arquivos (com caminho) de uma matéria. noticia: o texto de um aviso do professor.",
	}),
	codigo: Type.Optional(Type.String({ description: "Código da matéria (ex.: ICE0001), para materia e noticia." })),
	sigaaId: Type.Optional(Type.String({ description: "Id da notícia, como listado em materia." })),
});

const cortar = (texto: string) => {
	const { content, truncated } = capOutput(texto.split("\n"));
	return truncated ? `${content}\n\n[cortado em ${formatSize(MAX_OUTPUT_BYTES)}]` : content;
};

export function ufjTool(deps: UfjToolDeps): AgentTool<typeof ufjInput> {
	return {
		name: "ufj",
		label: "ufj",
		description:
			"Consulta o semestre do aluno na UFJ, sincronizado do SIGAA: matérias, provas com data, tarefas com prazo e instruções, avisos do professor e os arquivos de cada aula com o caminho para ler. Use quando o aluno citar uma matéria, uma prova, uma tarefa ou o material do professor; depois leia os arquivos pelo caminho devolvido.",
		parameters: ufjInput,
		execute: serverExecute("ufj", ufjInput, async (input) => {
			if (input.acao === "materias") return cortar(deps.materias());
			const codigo = input.codigo?.trim().toUpperCase();
			if (input.acao === "materia") {
				if (!codigo) throw new Error("Informe o código da matéria.");
				const texto = deps.materia(codigo);
				if (texto === null) throw new Error(`Matéria desconhecida: ${codigo}.`);
				return cortar(texto);
			}
			const sigaaId = input.sigaaId?.trim();
			if (!codigo || !sigaaId) throw new Error("Informe o código da matéria e o id da notícia.");
			const texto = deps.noticia(codigo, sigaaId);
			if (texto === null) throw new Error("Notícia não encontrada.");
			return cortar(texto);
		}),
	};
}
