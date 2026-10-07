import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { SyncBadge } from '../../components/SyncBadge'
import { listFarmers } from '../../db/repository'
import { useT } from '../../i18n/context'
import { FarmerDetail } from './FarmerDetail'

export function Farmers() {
  const { t } = useT()
  const farmers = useLiveQuery(listFarmers, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (selectedId) return <FarmerDetail clientId={selectedId} onClose={() => setSelectedId(null)} />

  return (
    <>
      <header className="screen-header">
        <h1>{t('farmers.title')}</h1>
        {farmers && farmers.length > 0 && <p className="progress-label">{t('farmers.count', { n: farmers.length })}</p>}
      </header>

      <main className="screen-body">
        {farmers?.length === 0 && <p className="note">{t('farmers.empty')}</p>}
        <ul className="farmer-list">
          {farmers?.map((farmer) => (
            <li key={farmer.clientId}>
              <button type="button" className="card farmer-row" onClick={() => setSelectedId(farmer.clientId)}>
                <span className="farmer-main">
                  <span className="farmer-name">{farmer.name}</span>
                  <span className="farmer-meta">{[farmer.community, farmer.region].filter(Boolean).join(', ') || farmer.phone}</span>
                </span>
                <SyncBadge status={farmer.status} />
              </button>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
