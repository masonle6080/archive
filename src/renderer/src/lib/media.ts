export function mediaUrl(fileName: string): string {
  return `media://${encodeURIComponent(fileName)}`
}
