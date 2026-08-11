import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NeoStateBlock } from '@/components/ui/neo-state-block'

export function ImportReviewEmpty() {
  const { t } = useTranslation()
  return (
    <NeoStateBlock
      icon="receipt-long"
      title={t('gastos:import.empty.title')}
      description={t('gastos:import.empty.body')}
      style={styles.block}
    />
  )
}

const styles = StyleSheet.create({
  block: { marginVertical: 12 },
})
