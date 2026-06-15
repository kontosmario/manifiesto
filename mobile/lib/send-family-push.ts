import { supabase } from '@/lib/supabase'
import { getCachedProfileDisplayName } from '@/lib/profile-display-name-cache'

interface SendFamilyPushInput {
  familyId: string
  title: string
  body: string
  kind?: string
  url?: string
}

// Token que los callers sociales ("{actor} cargó un gasto") ponen en el
// título; lo reemplazamos acá por el nombre de quien dispara el push. Así
// el nombre se resuelve en UN solo lugar y cada call site solo elige el
// verbo. Los pushes sin el token (zombie/advisor) quedan intactos.
const ACTOR_TOKEN = '{actor}'

function resolveActorName(session: {
  user?: { id?: string; user_metadata?: { display_name?: unknown } }
} | null): string {
  const userId = session?.user?.id
  const cached = userId ? getCachedProfileDisplayName(userId) : null
  const meta = session?.user?.user_metadata?.display_name
  const name = (cached ?? (typeof meta === 'string' ? meta : '')).trim()
  // Fallback genérico: nunca mostramos "{actor}" crudo ni un push vacío.
  return name || 'Un familiar'
}

export async function sendFamilyPush(input: SendFamilyPushInput): Promise<void> {
  const { data, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  const accessToken = data.session?.access_token
  if (!accessToken) {
    throw new Error('No hay sesión activa para enviar push.')
  }

  const actorName = resolveActorName(data.session)
  const withActor = (text: string) => text.split(ACTOR_TOKEN).join(actorName)

  const { error } = await supabase.functions.invoke('send-family-push', {
    body: {
      ...input,
      title: withActor(input.title),
      body: withActor(input.body),
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (error) {
    throw error
  }
}
