/**
 * CADERNOS JUPYTER EM TEXTO (spec SIGAA §7.8): as células de texto como estão
 * e as de código em blocos cercados, sem as saídas (que podem ser enormes).
 * Sem dependência nova; um JSON inválido volta como veio.
 */

interface Celula {
	cell_type?: string;
	source?: string | string[];
}

const texto = (s: string | string[] | undefined) => (Array.isArray(s) ? s.join("") : (s ?? ""));

export function ipynbParaTexto(json: string): string {
	let nb: { cells?: Celula[]; metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } } };
	try {
		nb = JSON.parse(json);
	} catch {
		return json;
	}
	if (!nb || !Array.isArray(nb.cells)) return json;
	const linguagem = nb.metadata?.kernelspec?.language ?? nb.metadata?.language_info?.name ?? "";
	return nb.cells
		.map((c) => {
			const fonte = texto(c.source).replace(/\s+$/, "");
			if (!fonte) return "";
			return c.cell_type === "code" ? `\`\`\`${linguagem}\n${fonte}\n\`\`\`` : fonte;
		})
		.filter(Boolean)
		.join("\n\n")
		.concat("\n");
}
