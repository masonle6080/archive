export function TagList({ tags }: { tags: string[] }): JSX.Element | null {
  if (tags.length === 0) return null

  return <p className="text-xs text-terracotta-600 tracking-wide">{tags.join(' · ')}</p>
}
