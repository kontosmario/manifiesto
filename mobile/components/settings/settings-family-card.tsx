import { Platform, StyleSheet, View } from 'react-native'
import { SettingsRow } from '@/components/settings/settings-primitives'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { SectionHeader } from '@/components/ui/section-header'

interface SettingsFamilyCardProps {
  familyCode: string
  hasPushSubscription: boolean
  householdSetupStatus: string
  isPushLoading: boolean
  onCopyFamilyCode: () => void
  onOpenControl: () => void
  onOpenFilamentSpike: () => void
  onOpenHouseholdSetup: () => void
  onPushActivation: () => void
  supportsPushActivation: boolean
}

export function SettingsFamilyCard({
  familyCode,
  hasPushSubscription,
  householdSetupStatus,
  isPushLoading,
  onCopyFamilyCode,
  onOpenControl,
  onOpenFilamentSpike,
  onOpenHouseholdSetup,
  onPushActivation,
  supportsPushActivation,
}: SettingsFamilyCardProps) {
  return (
    <BrandedPanel style={styles.card}>
      <SectionHeader
        subtitle="Accesos rápidos y configuración compartida del hogar."
        title="Familia"
      />

      <View style={styles.rows}>
        <SettingsRow
          iconFallback="group"
          iconName="person.2.fill"
          onPress={onCopyFamilyCode}
          subtitle="Tocá para copiar y compartir"
          title="Código familiar"
          value={familyCode}
        />
        <SettingsRow
          iconFallback="notifications"
          iconName="bell.badge.fill"
          isLoading={supportsPushActivation && isPushLoading}
          onPress={onPushActivation}
          subtitle={
            !supportsPushActivation
              ? 'Disponible sólo en development build. Expo Go no soporta push remoto.'
              : hasPushSubscription
                ? 'El dispositivo ya recibe notificaciones.'
                : 'Activá recordatorios y avisos compartidos.'
          }
          title="Notificaciones"
          value={
            supportsPushActivation
              ? hasPushSubscription
                ? 'Activo'
                : 'Activar'
              : 'Dev build'
          }
        />
        <SettingsRow
          iconFallback="tune"
          iconName="slider.horizontal.3"
          onPress={onOpenHouseholdSetup}
          subtitle="Reconfigura ingreso, distribución porcentual, resguardo diario y check-in del hogar."
          title="Configuracion guiada"
          value={householdSetupStatus}
        />
        <SettingsRow
          iconFallback="insights"
          iconName="chart.line.uptrend.xyaxis"
          onPress={onOpenControl}
          subtitle="Abrí control diario, gasto inteligente y tendencia."
          title="Control"
          value="Ver"
        />
        {Platform.OS !== 'web' ? (
          <SettingsRow
            iconFallback="view-in-ar"
            iconName="arkit"
            onPress={onOpenFilamentSpike}
            subtitle="Abrí la prueba Filament incluida en el build nativo."
            title="Spike 3D nativo"
            value="Probar"
          />
        ) : null}
      </View>
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
  },
  rows: {
    gap: 12,
  },
})
