const PHRASES = [
  'held steady overnight',
  'coming into leaf',
  'quiet since the last frost',
  'a little overcast',
  'settling in for the season',
  'first light, still cool',
  'gone to seed',
  'nothing much to report',
  'the light is turning early',
  'still, no wind to speak of',
  'thawed out by noon',
  'worth writing down'
]

/** Deterministic per-day pick, so it reads like a running log rather than a random shuffle. */
export function todaysJournalLine(date = new Date()): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000
  )
  return PHRASES[dayOfYear % PHRASES.length]
}
