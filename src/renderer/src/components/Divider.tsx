export function Divider({ className = '' }: { className?: string }): JSX.Element {
  return <hr className={`border-t border-sage-200/70 ${className}`} />
}
