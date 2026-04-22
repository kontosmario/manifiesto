import { BlockingScreenView } from '@/components/ui/blocking-screen-view'

interface BlockingScreenProps {
  message?: string
}

export function BlockingScreen({ message = 'Cargando...' }: BlockingScreenProps) {
  return <BlockingScreenView message={message} />
}
