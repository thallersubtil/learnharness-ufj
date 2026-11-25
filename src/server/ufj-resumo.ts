/** O resumo do semestre UFJ para o system prompt (spec chat+SIGAA §5.2): lê a
 *  biblioteca e chama a função pura do core. Sem biblioteca, ou com erro de
 *  leitura, devolve "" (o prompt fica como antes). */

import { composeResumoUfj, type TurmaDaMateria } from "../core/resumo-ufj.ts";
import { stores } from "./stores.ts";

export function turmasDaBiblioteca(): TurmaDaMateria[] {
	const { materias } = stores.bibliotecaStore.listMaterias();
	return materias.flatMap((materia) => stores.bibliotecaStore.listTurmas(materia.codigo).map((turma) => ({ materia, turma })));
}

export function resumoUfj(hoje = new Date()): string {
	try {
		return composeResumoUfj(turmasDaBiblioteca(), hoje);
	} catch {
		return "";
	}
}
