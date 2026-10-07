import { useCallback, useState } from 'react'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { formatCurrency } from '../../domain/country'
import { CROP_IDS, type CropId } from '../../domain/farmer'
import { isListingList } from '../../domain/listings'
import { useCachedRemote } from '../../hooks/useCachedRemote'
import { useT } from '../../i18n/context'
import { fetchListings } from '../../listings/listingsApi'

export function BrowseProduce({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const [crop, setCrop] = useState<CropId | null>(null)
  const load = useCallback(() => fetchListings(crop ?? undefined), [crop])
  const { state, reload, stale } = useCachedRemote(`listings:${crop ?? 'all'}`, load, isListingList)

  return (
    <>
      <ScreenHeader title={t('browse.title')} onBack={onBack} />
      <main className="screen-body">
        <div className="pill-row">
          <button type="button" className={crop === null ? 'pill pill-on-green is-selected' : 'pill pill-on-green'} aria-pressed={crop === null} onClick={() => setCrop(null)}>
            {t('browse.all')}
          </button>
          {CROP_IDS.map((id) => (
            <button key={id} type="button" className={crop === id ? 'pill pill-on-green is-selected' : 'pill pill-on-green'} aria-pressed={crop === id} onClick={() => setCrop(id)}>
              {t(`crop.${id}`)}
            </button>
          ))}
        </div>

        {stale && (
          <p className="note" role="status">
            {t('browse.stale')}
          </p>
        )}
        <RemoteView state={state} onRetry={reload}>
          {(listings) =>
            listings.length === 0 ? (
              <p className="note">{t('browse.empty')}</p>
            ) : (
              <ul className="plain-list">
                {listings.map((listing) => (
                  <li key={listing.id} className="card crop-check">
                    <span className="check-crop">
                      <span className="crop-tile" style={{ background: CROP_BACKGROUND[listing.crop] }}>
                        <CropArt crop={listing.crop} size={40} />
                      </span>
                      <span>
                        <strong>{t(`crop.${listing.crop}`)}</strong>
                        <br />
                        {t('browse.priceLine', { kg: listing.quantityKg, price: formatCurrency(listing.pricePerKg, listing.currency) })}
                      </span>
                    </span>
                    <span className="farmer-meta">{[listing.community, listing.sellerName || t('browse.unnamed')].filter(Boolean).join(' · ')}</span>
                    {listing.mine ? (
                      <span className="sample-badge">{t('browse.yours')}</span>
                    ) : (
                      <span className="agent-actions">
                        <a className="btn btn-secondary btn-link" href={`tel:${listing.sellerPhone}`}>
                          {t('browse.call')}
                        </a>
                        <a className="btn btn-secondary btn-link" href={`sms:${listing.sellerPhone}`}>
                          {t('browse.text')}
                        </a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </main>
    </>
  )
}
