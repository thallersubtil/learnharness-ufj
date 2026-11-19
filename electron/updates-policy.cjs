"use strict";

/**
 * Política de atualização automática do LearnHarness UFJ (spec Etapa A §7.14).
 *
 * Desligada até a Etapa B: este app ainda não publica releases próprias, e o
 * canal herdado do projeto original trocaria este app pelo original na
 * primeira atualização. Quando a Etapa B publicar releases em
 * thallersubtil/learnharness-ufj, esta função passa a devolver true.
 */
function updatesEnabled() {
	return false;
}

module.exports = { updatesEnabled };
