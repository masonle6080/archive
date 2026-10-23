import { useRef, useState, type ReactNode } from 'react'

export function DropZone({
  onFiles,
  multiple = false,
  accept = 'image/*,video/*',
  className = '',
  children
}: {
  onFiles: (files: File[]) => void
  multiple?: boolean
  accept?: string
  className?: string
  children: ReactNode
}): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFiles(Array.from(e.dataTransfer.files))
      }}
      onClick={() => inputRef.current?.click()}
      className={[
        'cursor-pointer transition-colors',
        dragging ? 'bg-sage-50' : '',
        className
      ].join(' ')}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}
