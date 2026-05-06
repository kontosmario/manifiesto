// Copy selection for the Asistente Financiero EmptyState.
//
// Two distinct empty states:
//   - First-time / new account (`usingMock`): the user just registered
//     and there is no income or no expenses yet. The assistant has
//     literally nothing to talk about; framing this as "you reviewed
//     all suggestions" would be a lie.
//   - Established user with no pending signals: the user has data and
//     either had no signals this cycle or dismissed them all. The
//     original "Revisaste todas las sugerencias" copy applies.

export interface AsistenteEmptyCopyInput {
  usingMock: boolean
}

export interface AsistenteEmptyCopy {
  title: string
  body: string
}

export function selectAsistenteEmptyCopy(
  input: AsistenteEmptyCopyInput,
): AsistenteEmptyCopy {
  if (input.usingMock) {
    return {
      title: 'Listos para empezar',
      body: 'Carga tu ingreso y un par de gastos para que el asistente pueda mirar tus números.',
    }
  }
  return {
    title: 'Revisaste todas las sugerencias',
    body: 'El asistente sigue mirando tus números. Si los patrones persisten, las sugerencias volverán a aparecer.',
  }
}
