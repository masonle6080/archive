export function mediaUrl(fileName: string): string {
  return window.api.media.baseUrl + encodeURIComponent(fileName)
}
