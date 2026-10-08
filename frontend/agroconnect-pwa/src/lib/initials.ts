/** "Efua Agent" becomes "EA" and "Efua" becomes "E". With no name, the fallback's first letter is used. */
export function initialsOf(name: string, fallback: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
  const text = letters.join('') || [...fallback.trim()][0] || ''
  return text.toLocaleUpperCase()
}
