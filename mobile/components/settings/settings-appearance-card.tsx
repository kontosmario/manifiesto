import { BrandedPanel } from '@/components/ui/branded-panel'
import { SectionHeader } from '@/components/ui/section-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { ThemePreference } from '@/theme/palette'

interface SettingsAppearanceCardProps {
  preference: ThemePreference
  onChange: (preference: ThemePreference) => void
}

export function SettingsAppearanceCard({
  preference,
  onChange,
}: SettingsAppearanceCardProps) {
  return (
    <BrandedPanel style={{ gap: 18 }} variant="accent">
      <SectionHeader
        subtitle="Claro, oscuro o siguiendo el sistema."
        title="Apariencia"
      />
      <SegmentedControl
        onChange={onChange}
        options={[
          { label: 'Sistema', value: 'system' },
          { label: 'Claro', value: 'light' },
          { label: 'Oscuro', value: 'dark' },
        ]}
        value={preference}
      />
    </BrandedPanel>
  )
}
