// ADAPTADOR. El header y los dots del wizard viven en el kit genérico
// (`@/components/wizard/parts/step-header`); acá queda SOLO la resolución del
// copy de fijos —qué dice el título en cada paso y qué significa "volver"— que
// es lo único que el kit no puede saber. La firma es la de siempre para que la
// screen viva no cambie.
import { useTranslation } from 'react-i18next'
import { WizardDots, WizardHeader } from '@/components/wizard/parts/step-header'

type Step = 1 | 2

export interface StepHeaderProps {
  step: Step
  isEditing: boolean
  /** Step 1 → close sheet. Step 2 → back to step 1. */
  onBack: () => void
}

export function StepHeader({ step, isEditing, onBack }: StepHeaderProps) {
  const { t } = useTranslation()
  const stepTitle =
    step === 1
      ? isEditing
        ? t('fijos:wizard.stepEdit')
        : t('fijos:wizard.stepNew')
      : t('fijos:wizard.stepReview')
  return (
    <WizardHeader
      title={stepTitle}
      onBack={onBack}
      backAccessibilityLabel={
        step === 2 ? t('fijos:wizard.backToPrevious') : t('fijos:wizard.close')
      }
    />
  )
}

export function StepDots({ step }: { step: Step }) {
  return <WizardDots step={step} />
}
