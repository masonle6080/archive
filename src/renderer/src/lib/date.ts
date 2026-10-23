export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
