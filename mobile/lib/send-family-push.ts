import { supabase } from '@/lib/supabase'

interface SendFamilyPushInput {
  familyId: string
  title: string
  body: string
  kind?: string
  url?: string
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

  const { error } = await supabase.functions.invoke('send-family-push', {
    body: input,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (error) {
    throw error
  }
}
