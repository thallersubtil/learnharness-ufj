/** Pequenos ajudantes de texto dos leitores do SIGAA. */

/** Espaços colapsados e sem as pontas (inclui o espaço duro &nbsp;). */
export function limpo(s: string | null | undefined): string {
	return (s ?? "").replace(/[\s ]+/g, " ").trim();
}

/** "04/09/2026" → "2026-09-04"; outro formato → undefined. */
export function dataBr(s: string): string | undefined {
	const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
	return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}
