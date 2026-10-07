import { useCallback, useState } from 'react'
import { fetchCropCheckPhoto, giveAdvice } from '../advice/adviceApi'
import { MAX_ADVICE_LENGTH, type CropCheckView } from '../domain/advice'
import { useT } from '../i18n/context'
import { RejectedError } from '../lib/http'
import { AuthedImage } from './AuthedImage'
import { Button } from './Button'
import { CropArt } from './CropArt'
import { CROP_BACKGROUND } from './cropColours'
import { SyncBadge } from './SyncBadge'

interface CropCheckCardProps {
  check: CropCheckView
  /** Show the advice form on a check that is still waiting. */
  canAnswer: boolean
  onAnswered?: () => void
}

export function CropCheckCard({ check, canAnswer, onAnswered }: CropCheckCardProps) {
  const { t } = useT()
  const loadPhoto = useCallback(() => fetchCropCheckPhoto(check.id), [check.id])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!text.trim()) return setError(t('checks.invalid'))
    setBusy(true)
    setError(null)
    try {
      await giveAdvice(check.id, text.trim())
      onAnswered?.()
    } catch (failure) {
      setError(failure instanceof RejectedError ? failure.message : t('common.needsSignal'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="card crop-check">
      <span className="list-item">
        <span className="check-crop">
          <span className="crop-tile small" style={{ background: CROP_BACKGROUND[check.crop] }}>
            <CropArt crop={check.crop} size={28} />
          </span>
          <strong>{t(`crop.${check.crop}`)}</strong>
        </span>
        <SyncBadge status={check.status === 'answered' ? 'sent' : 'sending'} label={t(`checks.status.${check.status}`)} />
      </span>

      <span className="farmer-meta">
        {t('checks.from', { name: check.farmerName || t('checks.unnamed') })} · {check.farmerPhone} · {new Date(check.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
      </span>
      <p>{check.note}</p>
      {check.hasPhoto && <AuthedImage load={loadPhoto} alt={t('checks.photoAlt')} />}

      {check.advice && (
        <p className="note">
          <strong>{t('checks.adviceBy', { name: check.advice.by })}:</strong> {check.advice.text}
        </p>
      )}

      {!check.advice && canAnswer && (
        <>
          <label className="label" htmlFor={`advice-${check.id}`}>
            {t('checks.adviceLabel')}
          </label>
          <textarea id={`advice-${check.id}`} className="input textarea" rows={3} maxLength={MAX_ADVICE_LENGTH} value={text} onChange={(e) => setText(e.target.value)} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={() => void send()}>
            {busy ? t('checks.sending') : t('checks.send')}
          </Button>
        </>
      )}
    </li>
  )
}
