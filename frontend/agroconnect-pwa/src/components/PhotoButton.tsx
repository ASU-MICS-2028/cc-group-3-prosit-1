import type { ChangeEvent, ReactNode } from 'react'

interface PhotoButtonProps {
  children: ReactNode
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/** A button that opens the camera. The file input sits inside the label, so no ref or click handler is needed. */
export function PhotoButton({ children, onChange }: PhotoButtonProps) {
  return (
    <label className="btn btn-secondary photo-button">
      <input className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={onChange} />
      {children}
    </label>
  )
}
