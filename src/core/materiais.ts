/** O tipo de um material da turma pela extensão (spec chat+SIGAA §5.5): o que
 *  o app abre dentro de si, como mostra, e o rótulo curto da lista. */

export type TipoDeMaterial = "pdf" | "texto" | "imagem" | "outro";

export interface ClasseDeMaterial {
	tipo: TipoDeMaterial;
	/** Rótulo curto na lista: PDF, caderno, código, texto, imagem, Word, ODT, zip… */
	rotulo: string;
	/** O app abre (true) ou só baixa (false). */
	abre: boolean;
	/** Linguagem do bloco de código, quando é código. */
	linguagem?: string;
}

const CODIGO: Record<string, string> = { ".c": "c", ".h": "c", ".py": "python", ".java": "java", ".js": "javascript", ".ts": "typescript" };
const OUTROS: Record<string, string> = { ".docx": "Word", ".doc": "Word", ".odt": "ODT", ".zip": "zip", ".rar": "rar", ".pptx": "PowerPoint", ".xlsx": "Excel" };

export function tipoDeMaterial(nome: string): ClasseDeMaterial {
	const n = nome.toLowerCase();
	const ext = n.includes(".") ? n.slice(n.lastIndexOf(".")) : "";
	if (ext === ".pdf") return { tipo: "pdf", rotulo: "PDF", abre: true };
	if (n.endsWith(".ipynb.md") || ext === ".ipynb") return { tipo: "texto", rotulo: "caderno", abre: true, linguagem: undefined };
	if (ext in CODIGO) return { tipo: "texto", rotulo: "código", abre: true, linguagem: CODIGO[ext] };
	if (ext === ".md" || ext === ".txt") return { tipo: "texto", rotulo: "texto", abre: true, linguagem: undefined };
	if ([".png", ".jpg", ".jpeg"].includes(ext)) return { tipo: "imagem", rotulo: "imagem", abre: true };
	return { tipo: "outro", rotulo: OUTROS[ext] ?? (ext ? ext.slice(1) : "arquivo"), abre: false };
}
