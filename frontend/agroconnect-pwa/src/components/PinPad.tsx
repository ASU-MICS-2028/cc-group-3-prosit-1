import { useState } from 'react'
import { useT } from '../i18n/context'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

interface PinPadProps {
  length: number
  onComplete: (pin: string) => void
  disabled?: boolean
}

/** A large on-screen number pad, so a PIN is never typed on a small system keyboard. */
export function PinPad({ length, onComplete, disabled }: PinPadProps) {
  const { t } = useT()
  const [digits, setDigits] = useState('')

  function press(digit: string) {
    if (disabled || digits.length >= length) return
    const next = digits + digit
    if (next.length === length) {
      setDigits('')
      onComplete(next)
    } else {
      setDigits(next)
    }
  }

  return (
    <div className="pinpad">
      <div className="pin-dots" role="img" aria-label={`${digits.length} / ${length}`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i < digits.length ? 'pin-dot is-filled' : 'pin-dot'} />
        ))}
      </div>
      <div className="pin-keys">
        {KEYS.map((key) => (
          <button key={key} type="button" className="pin-key" disabled={disabled} onClick={() => press(key)}>
            {key}
          </button>
        ))}
        <span />
        <button type="button" className="pin-key" disabled={disabled} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          className="pin-key pin-key-delete"
          disabled={disabled || digits.length === 0}
          aria-label={t('auth.pin.delete')}
          onClick={() => setDigits(digits.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
    </div>
  )
}
