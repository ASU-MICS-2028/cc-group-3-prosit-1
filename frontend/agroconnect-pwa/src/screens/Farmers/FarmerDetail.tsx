import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { FarmerPayments } from '../../components/FarmerPayments'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SyncBadge } from '../../components/SyncBadge'
import { getFarmer, getPhoto, setStatus } from '../../db/repository'
import { SYNC_STATUS } from '../../domain/farmer'
import { useT } from '../../i18n/context'
import { requestSync } from '../../sync/syncQueue'

interface FarmerDetailProps {
  clientId: string
  onClose: () => void
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function FarmerDetail({ clientId, onClose }: FarmerDetailProps) {
  const { t } = useT()
  const farmer = useLiveQuery(() => getFarmer(clientId), [clientId])
  const storedPhoto = useLiveQuery(() => getPhoto(clientId), [clientId])

  const photoUrl = useMemo(() => (storedPhoto ? URL.createObjectURL(storedPhoto.blob) : null), [storedPhoto])
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  if (!farmer) return null

  async function sendAgain() {
    await setStatus(clientId, SYNC_STATUS.SAVED, { errorMessage: null })
    void requestSync()
  }

  return (
    <>
      <header className="screen-header">
        <Button variant="text" className="back-link" onClick={onClose}>
          ← {t('detail.close')}
        </Button>
        <h1>{farmer.name}</h1>
        <p className="progress-label">
          {t('detail.registeredOn', { date: new Date(farmer.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) })}
        </p>
      </header>

      <main className="screen-body">
        <section className="card">
          <SyncBadge status={farmer.status} />
          {farmer.status === SYNC_STATUS.ATTENTION && (
            <>
              <p className="detail-error">
                <strong>{t('detail.error')}:</strong> {farmer.errorMessage}
              </p>
              <Button onClick={() => void sendAgain()}>{t('detail.retry')}</Button>
            </>
          )}
        </section>

        <section className="card">
          {photoUrl ? (
            <img className="thumb detail-photo" src={photoUrl} alt="" width="96" height="96" />
          ) : (
            <p className="hint">{t('detail.noPhoto')}</p>
          )}
          <dl className="detail-list">
            <DetailRow label={t('reg.phone')}>{farmer.phone}</DetailRow>
            <DetailRow label={t('reg.language')}>{t(`lang.${farmer.preferredLanguage}`)}</DetailRow>
            <DetailRow label={t('reg.community')}>{farmer.community || t('detail.notSet')}</DetailRow>
            <DetailRow label={t('reg.region')}>{farmer.region || t('detail.notSet')}</DetailRow>
            <DetailRow label={t('reg.farmSize')}>
              {farmer.farmSizeAcres ? t('detail.acres', { n: farmer.farmSizeAcres }) : t('detail.notSet')}
            </DetailRow>
            <DetailRow label={t('reg.crops')}>
              {farmer.crops.length === 0 ? (
                t('detail.notSet')
              ) : (
                <span className="crop-tags">
                  {farmer.crops.map((crop) => (
                    <span key={crop} className="crop-tag" style={{ background: CROP_BACKGROUND[crop] }}>
                      <CropArt crop={crop} size={24} />
                      {t(`crop.${crop}`)}
                    </span>
                  ))}
                </span>
              )}
            </DetailRow>
            <DetailRow label={t('reg.gps')}>
              {farmer.gps
                ? `${t('reg.gpsAccuracy', { m: farmer.gps.accuracy })} · ${farmer.gps.lat.toFixed(5)}, ${farmer.gps.lng.toFixed(5)}`
                : t('detail.noGps')}
            </DetailRow>
            <DetailRow label={t('detail.consent')}>{t('detail.consentGiven')}</DetailRow>
          </dl>
        </section>

        <section className="card">
          <h2 className="card-title">{t('detail.payments')}</h2>
          {farmer.serverId ? <FarmerPayments recordId={farmer.serverId} /> : <p>{t('detail.paymentsAfterSync')}</p>}
        </section>
      </main>
    </>
  )
}
