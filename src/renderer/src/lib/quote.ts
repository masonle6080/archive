/** Deterministic per-day pick from the quote bank, so the home page reads
 *  the same quote all day rather than reshuffling on every render. */
export function quoteOfTheDay(quotes: string[], date = new Date()): string | null {
  if (quotes.length === 0) return null
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000
  )
  return quotes[dayOfYear % quotes.length]
}
