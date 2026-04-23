const notificationDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function notificationKindLabel(kind: string): string {
  switch (kind) {
    case 'expense':
      return 'Gasto'
    case 'fixed_expense':
      return 'Fijo'
    default:
      return 'Info'
  }
}

export function formatNotificationDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha'
  }

  return notificationDateTimeFormatter.format(parsed)
}
