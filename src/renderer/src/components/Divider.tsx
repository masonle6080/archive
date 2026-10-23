export function Divider({ className = '' }: { className?: string }): JSX.Element {
  return <hr className={`border-t border-line-200/70 ${className}`} />
}
