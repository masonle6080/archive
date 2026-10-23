// The one slug rule for entries and categories. The renderer and the entry
// store both use it, so the two never disagree.
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
