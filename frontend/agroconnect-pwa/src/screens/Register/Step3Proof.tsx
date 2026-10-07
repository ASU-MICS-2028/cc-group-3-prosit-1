import { Button } from '../../components/Button'
import { PhotoButton } from '../../components/PhotoButton'
import { useGps } from '../../hooks/useGps'
import { useT } from '../../i18n/context'
import { usePhotoPicker } from '../../hooks/usePhotoPicker'
import type { StepProps } from './stepProps'

const POOR_ACCURACY_METRES = 50

export function Step3Proof({ draft, update, errors }: StepProps) {
  const { t } = useT()
  const photo = usePhotoPicker(draft.photo, (picked) => update({ photo: picked }))
  const gps = useGps((gpsFix) => update({ gps: gpsFix }))

  const accuracyIsPoor = draft.gps !== null && draft.gps.accuracy > POOR_ACCURACY_METRES

  return (
    <>
      <section className="card form">
        <h2 className="card-title">{t('reg.photo')}</h2>
        <p className="hint">{t('reg.photoHint')}</p>

        <div className="photo-row">
          {photo.url && <img className="thumb" src={photo.url} alt="" width="96" height="96" />}
          <div>
            <PhotoButton onChange={(e) => void photo.onPicked(e)}>
              {draft.photo ? t('reg.photoRetake') : t('reg.photoTake')}
            </PhotoButton>
            {draft.photo && <p className="hint">{t('reg.photoSize', { kb: Math.round(draft.photo.size / 1024) })}</p>}
          </div>
        </div>

        {photo.state === 'working' && <p role="status">{t('reg.photoWorking')}</p>}
        {photo.state === 'failed' && (
          <p className="error" role="alert">
            {t('reg.photoFailed')}
          </p>
        )}
      </section>

      <section className="card form">
        <h2 className="card-title">{t('reg.gps')}</h2>
        <p className="hint">{t('reg.gpsHint')}</p>

        {draft.gps && (
          <p className={accuracyIsPoor ? 'gps-reading is-poor' : 'gps-reading'}>
            {t('reg.gpsAccuracy', { m: draft.gps.accuracy })}
            <span className="gps-coords">
              {draft.gps.lat.toFixed(5)}, {draft.gps.lng.toFixed(5)}
            </span>
          </p>
        )}
        {accuracyIsPoor && <p className="error">{t('reg.gpsPoor')}</p>}
        {gps.status === 'working' && (
          <p role="status">
            {t('reg.gpsWorking')} {gps.liveAccuracy !== null && t('reg.gpsLive', { m: gps.liveAccuracy })}
          </p>
        )}
        {gps.status === 'denied' && (
          <p className="error" role="alert">
            {t('reg.gpsDenied')}
          </p>
        )}
        {gps.status === 'failed' && (
          <p className="error" role="alert">
            {t('reg.gpsFailed')}
          </p>
        )}

        <Button disabled={gps.status === 'working'} onClick={gps.start}>
          {draft.gps ? t('reg.gpsRetry') : t('reg.gpsGet')}
        </Button>
      </section>

      <section className="card">
        <label className="consent">
          <input type="checkbox" checked={draft.consent} onChange={(e) => update({ consent: e.target.checked })} />
          <span>
            {t('reg.consent')} <span aria-hidden="true">*</span>
          </span>
        </label>
        {errors.consent && (
          <p className="error" role="alert">
            {errors.consent}
          </p>
        )}
      </section>
    </>
  )
}
