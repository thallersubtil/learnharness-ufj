/**
 * SÓ PARA DESENVOLVIMENTO: sobe o SIGAA falso dos testes numa porta fixa, para
 * ver a sincronização no navegador sem tocar no SIGAA de verdade.
 *
 *   npx tsx scripts/sigaa-falso-dev.ts
 *
 * Depois, rode o app com LH_SIGAA_BASE_URL=http://127.0.0.1:4877 e
 * LH_SIGAA_SENHA_DEV=1 e conecte com usuário "aluno.teste" e senha "teste".
 * Páginas e dados são inventados (tests/fixtures/sigaa).
 */

import { iniciarSigaaFalso } from "../tests/helpers/sigaa-falso.ts";

const falso = await iniciarSigaaFalso({ porta: 4877, senhaCerta: "teste", avisoDepoisDoLogin: true });
console.log(`SIGAA falso em ${falso.base} (usuário aluno.teste, senha teste)`);
