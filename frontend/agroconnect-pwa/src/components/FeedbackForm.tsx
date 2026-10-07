import { useState } from 'react'
import { addToOutbox } from '../db/outbox'
import { useT } from '../i18n/context'
import { Button } from './Button'
import { Field } from './Field'

const RATINGS = [1, 2, 3, 4, 5] as const
const MIN_MESSAGE_LENGTH = 3

interface FeedbackFormProps {
  screen: string
  onDone?: () => void
}

export function FeedbackForm({ screen, onDone }: FeedbackFormProps) {
  const { t, language } = useT()
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function send() {
    if (message.trim().length < MIN_MESSAGE_LENGTH) return setError(t('feedback.tooShort'))
    await addToOutbox('feedback', { screen, message: message.trim(), rating, appLanguage: language })
    setMessage('')
    setRating(null)
    setError(null)
    setSaved(true)
  }

  if (saved) {
    return (
      <div className="form">
        <p className="card-title" role="status">
          {t('feedback.saved')}
        </p>
        <Button onClick={() => setSaved(false)}>{t('feedback.another')}</Button>
        {onDone && (
          <Button variant="text" className="on-card" onClick={onDone}>
            {t('common.close')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="form">
      <p className="hint">{t('feedback.hint')}</p>
      <Field label={t('feedback.message')} htmlFor="fb-message" error={error ?? undefined}>
        <textarea id="fb-message" className="input textarea" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <fieldset className="field">
        <legend className="label">{t('feedback.rating')}</legend>
        <div className="pill-row">
          {RATINGS.map((value) => (
            <button
              key={value}
              type="button"
              className={rating === value ? 'pill is-selected' : 'pill'}
              aria-pressed={rating === value}
              onClick={() => setRating(rating === value ? null : value)}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <Button variant="main" onClick={() => void send()}>
        {t('feedback.send')}
      </Button>
      {onDone && (
        <Button variant="text" className="on-card" onClick={onDone}>
          {t('common.close')}
        </Button>
      )}
    </div>
  )
}
