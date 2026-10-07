import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { CropPicker } from '../../components/CropPicker'
import { Field } from '../../components/Field'
import { PhotoButton } from '../../components/PhotoButton'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SyncBadge } from '../../components/SyncBadge'
import { addToOutbox, listOutbox } from '../../db/outbox'
import type { CropId } from '../../domain/farmer'
import { usePhotoPicker } from '../../hooks/usePhotoPicker'
import { useT } from '../../i18n/context'

export function CropCheckForm({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const mine = useLiveQuery(() => listOutbox('cropCheck'), [])

  const [crop, setCrop] = useState<CropId | null>(null)
  const [note, setNote] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const photo = usePhotoPicker(photoBlob, setPhotoBlob)

  async function submit() {
    if (!crop || !note.trim()) return setError(t('check.invalid'))
    await addToOutbox('cropCheck', { crop, note: note.trim(), photo: photoBlob })
    setCrop(null)
    setNote('')
    setPhotoBlob(null)
    setError(null)
    setSaved(true)
  }

  return (
    <>
      <ScreenHeader title={t('check.title')} subtitle={t('check.hint')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <fieldset className="field">
            <legend className="label">{t('sell.crop')}</legend>
            <CropPicker value={crop} onChange={setCrop} />
          </fieldset>
          <Field label={t('check.note')} htmlFor="check-note">
            <textarea id="check-note" className="input textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="photo-row">
            {photo.url && <img className="thumb" src={photo.url} alt="" width="96" height="96" />}
            <PhotoButton onChange={(e) => void photo.onPicked(e)}>{photoBlob ? t('check.photoRetake') : t('check.photo')}</PhotoButton>
          </div>
          {photo.state === 'working' && <p role="status">{t('reg.photoWorking')}</p>}
          {photo.state === 'failed' && (
            <p className="error" role="alert">
              {t('reg.photoFailed')}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        {saved && (
          <p className="note" role="status">
            {t('check.saved')}
          </p>
        )}
        <Button variant="main" onClick={() => void submit()}>
          {t('check.send')}
        </Button>

        <section className="card">
          <h2 className="card-title">{t('check.mine')}</h2>
          {mine && mine.length > 0 ? (
            <ul className="plain-list">
              {mine.map((item) => (
                <li key={item.clientId} className="list-item">
                  <span>
                    <strong>{t(`crop.${item.payload.crop}`)}</strong>
                    <br />
                    {item.payload.note}
                  </span>
                  <SyncBadge status="saved" />
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('check.none')}</p>
          )}
        </section>
      </main>
    </>
  )
}
