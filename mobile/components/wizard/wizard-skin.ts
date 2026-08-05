/**
 * Piel del kit de wizard — ALIAS, no fork.
 *
 * El material del wizard (pozos, chips extruidos, CTA, header) se transcribió
 * del handoff dentro de `fijos-skin.tsx` porque el primer flujo en usarlo fue
 * el alta de fijos. No es piel "de fijos": es la piel del rediseño, y agregar
 * gasto / agregar ingreso dibujan exactamente las mismas superficies.
 *
 * Por qué un barrel de alias y NO mover el archivo:
 *  · `fijos-skin.tsx` tiene ~20 consumidores (la lista viva, el detalle, los
 *    grupos, la hero card). Renombrarlo sería un diff de 20 archivos aprobados
 *    y en producción para no ganar nada en runtime.
 *  · Un fork —copiar los tokens acá— haría que el wizard y la lista se
 *    separaran en silencio en cuanto alguien toque uno de los dos. Los valores
 *    tienen que seguir saliendo de UN solo `buildNeoSkin`.
 *
 * O sea: los flujos nuevos importan de `@/components/wizard/wizard-skin` y
 * leen nombres neutros; el objeto que reciben es el MISMO que ve la lista de
 * fijos, provisto por el mismo contexto. Montar `WizardSkinProvider` o
 * `FijosSkinProvider` es literalmente lo mismo — hay un solo contexto, así que
 * un wizard abierto adentro de la lista no anida dos pieles distintas.
 *
 * Sin provider el valor es `{ kind: 'classic' }`: los flujos que todavía no se
 * rediseñaron caen a su rama de siempre.
 */
export {
  buildNeoSkin,
  FIJOS_SHADOW_BLEED as WIZARD_SHADOW_BLEED,
  FijosSkinProvider as WizardSkinProvider,
  useFijosSkin as useWizardSkin,
} from '@/components/fijos/fijos-skin'

export type {
  FijosAddSkin as WizardAddSkin,
  FijosNeoSkin as WizardNeoSkin,
} from '@/components/fijos/fijos-skin'

// `FijosMode` no lo re-exporta `fijos-skin.tsx` (lo consume del spec), así que
// el alias sale de la fuente para no agregarle un export a un archivo vivo.
export type { FijosMode as WizardMode } from '@/components/redesign/fijos/fijos-spec'
