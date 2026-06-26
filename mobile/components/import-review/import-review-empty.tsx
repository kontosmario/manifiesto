import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'

export function ImportReviewEmpty() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.wrap}>
      <MaterialIcons name="receipt-long" size={36} color={theme.colors.textMuted} />
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {t('gastos:import.empty.title')}
      </Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>
        {t('gastos:import.empty.body')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  title: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 12, fontWeight: '500', textAlign: 'center', paddingHorizontal: 20 },
})
