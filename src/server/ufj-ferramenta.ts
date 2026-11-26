/** As closures da ferramenta `ufj` sobre a biblioteca (spec chat+SIGAA §5.3). */

import { textoMateria, textoMaterias, textoNoticia, turmasVisiveis } from "../core/resumo-ufj.ts";
import type { UfjToolDeps } from "../agent/tools/ufj.ts";
import { stores } from "./stores.ts";
import { turmasDaBiblioteca } from "./ufj-resumo.ts";

export function ufjToolDeps(): UfjToolDeps {
	const visivel = (codigo: string) => turmasVisiveis(turmasDaBiblioteca().filter((e) => e.materia.codigo === codigo)).visiveis[0] ?? null;
	return {
		materias: () => textoMaterias(turmasDaBiblioteca()),
		materia: (codigo) => {
			const e = visivel(codigo);
			if (!e) return null;
			const refs = stores.bibliotecaStore.readReferencias(e.materia.codigo, e.turma.id);
			return textoMateria(e, refs, (arquivo) => stores.bibliotecaStore.referenciaPath(e.materia.codigo, e.turma.id, arquivo));
		},
		noticia: (codigo, sigaaId) => {
			const e = visivel(codigo);
			return e ? textoNoticia(e, sigaaId) : null;
		},
	};
}
