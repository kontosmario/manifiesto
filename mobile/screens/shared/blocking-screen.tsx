import { BlockingScreenView } from '@/components/shared/blocking-screen-view'

interface BlockingScreenProps {
  message?: string
}

export function BlockingScreen({ message = 'Cargando...' }: BlockingScreenProps) {
  return <BlockingScreenView message={message} />
}
