// Hoja "Ver detalle" del alta de gasto: lo del viejo paso 2 que NO entra en la
// tira compacta (`impact-strip.tsx`).
//
// Divulgación progresiva, no una segunda pantalla: la tira ya dice el veredicto
// —cuánto te queda hoy, en qué zona cae y si te pasás—, y acá vive el desglose
// que sólo mira quien lo quiere mirar: las columnas ANTES→AHORA con sus
// porcentajes, el chip del salto en puntos, el Brot y la línea que explica qué
// pasa con el excedente.
//
// Sólo se abre cuando la tira está en su estado COMPLETO (ciclo hidratado,
// gasto dentro del ciclo vigente y con cupo contra el cual medir): sin base no
// hay columnas que llenar, y ese caso la tira lo resuelve con su propia línea.
import { StyleSheet, View } from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { ModalCard } from '@/components/ui/modal-card'
import { ImpactColumns } from '@/components/wizard/parts/impact-columns'
import { STEP_DELAYED_ENTER } from '@/components/wizard/step-motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import type { AddExpenseImpact } from '@/features/expenses/add-expense-impact'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { formatMoney } from '@/utils/money'
import { zoneForCupoPct } from './cupo-gauge'

export interface ImpactDetailSheetProps {
  visible: boolean
  onClose: () => void
  impact: AddExpenseImpact
}

export function ImpactDetailSheet({ visible, onClose, impact }: ImpactDetailSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  const usedPctAfter = impact.usedPctAfter ?? 0
  const zone = zoneForCupoPct(usedPctAfter)
  const brotPose: BrotPose = impact.exceeds ? 'worried' : zone === 'media' ? 'zen' : 'cheer'

  return (
    <ModalCard
      visible={visible}
      onClose={onClose}
      skin="neo"
      title={t('gastos:addExpense.wizard.step2.detailTitle')}
      subtitle={t('gastos:addExpense.wizard.step2.impactEyebrow')}
    >
      <View style={styles.head}>
        <BrotMascot pose={brotPose} size={52} shadow={false} />
        <View style={styles.headBody}>
          {/* El chip es la cifra que el usuario acaba de decidir: entra DESPUÉS
              de la hoja. Sin el retraso aparece pintado desde el primer frame y
              se pierde el "esto sumaste". */}
          {neo && impact.deltaPct != null && impact.deltaPct > 0 ? (
            <AnimatedText
              entering={STEP_DELAYED_ENTER}
              numberOfLines={1}
              // Escala con la preferencia de la APP. El tope propio de la
              // preferencia (1.2×) es el mismo que este `maxFontSizeMultiplier`
              // reservaba para el escalado del OS, ya apagado.
              maxFontSizeMultiplier={1.2}
              style={[
                styles.deltaChip,
                {
                  borderRadius: neo.add.deltaChip.radius,
                  paddingHorizontal: neo.add.deltaChip.padH,
                  paddingVertical: neo.add.deltaChip.padV,
                  fontSize: neo.add.deltaChip.fontSize,
                  // NO `deltaChip.ink`: ese token es el clay `#C25B33` de bordes
                  // y fills, y a 11px sobre `#F6DCCB` (el fondo del propio chip)
                  // se queda en 3.31:1 — abajo de los 4.5:1 de AA para texto
                  // normal. `accentClayInk` es la variante de TEXTO (5.1:1 sobre
                  // esa misma superficie) y en oscuro vale exactamente lo mismo
                  // que `accentClay`, así que el tema oscuro no se mueve.
                  color: neo.add.accentClayInk,
                  backgroundColor: neo.add.deltaChip.background,
                  fontFamily: neo.font('900'),
                },
              ]}
            >
              {t('gastos:addExpense.wizard.step2.delta', { pp: impact.deltaPct })}
            </AnimatedText>
          ) : null}
        </View>
      </View>

      <ImpactColumns
        beforeLabel={t('gastos:addExpense.wizard.step2.beforeShort')}
        afterLabel={t('gastos:addExpense.wizard.step2.afterShort')}
        beforeValue={formatMoney(impact.budgetBefore)}
        // El clampeado, no el crudo: `formatMoney` toma valor absoluto, así que
        // un saldo negativo se imprimiría como positivo. El exceso se dice
        // aparte, con su propia línea.
        afterValue={formatMoney(impact.budgetAfterClamped)}
        beforePctText={
          impact.usedPctBefore != null
            ? t('gastos:addExpense.wizard.step2.pctOfBudget', { pct: impact.usedPctBefore })
            : undefined
        }
        afterPctText={
          impact.usedPctAfter != null
            ? t('gastos:addExpense.wizard.step2.pctOfBudget', { pct: impact.usedPctAfter })
            : undefined
        }
      />

      {/* Pasarse NO bloquea el alta: el gasto ya ocurrió y ocultarlo no lo
          deshace. La línea explica qué pasa con el excedente para que confirmar
          no se sienta un error. */}
      {impact.exceeds ? (
        <Text
          style={[
            styles.exceedsHint,
            { color: neo ? neo.mutedInk : theme.colors.textMuted },
            neo ? { fontFamily: neo.font('700') } : null,
          ]}
        >
          {t('gastos:addExpense.wizard.step2.exceedsHint')}
        </Text>
      ) : null}
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headBody: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  deltaChip: { fontWeight: '900', fontFamily: nunitoFamily('900'), overflow: 'hidden' },
  exceedsHint: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 18,
  },
})
