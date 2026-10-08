import { useState } from 'react'
import { Button } from '../../components/Button'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useAdvice } from '../../content/useContent'
import { useT } from '../../i18n/context'
import { CropCheckForm } from './CropCheckForm'
import { ListenButton } from '../../audio/ListenButton'

export function Advice() {
  const { t } = useT()
  const [checking, setChecking] = useState(false)
  const { view } = useAdvice()

  if (checking) return <CropCheckForm onBack={() => setChecking(false)} />

  return (
    <>
      <ScreenHeader title={t('advice.title')} />
      <main className="screen-body">
        {!view && <p>{t('common.loading')}</p>}
        {view?.sample && <SampleBadge label="common.sampleAdvice" />}
        {view?.cards.map((card) => (
          <article key={card.title} className="card advice-card">
            <span className="crop-tile" style={{ background: CROP_BACKGROUND[card.crop] }}>
              <CropArt crop={card.crop} size={44} />
            </span>
            <div>
              <p className="card-title">{card.title}</p>
              <p>{card.body}</p>
              {/* Advice is entered in English; read it in English for farmers who cannot read it. */}
              <ListenButton text={`${card.title}. ${card.body}`} lang="en" />
            </div>
          </article>
        ))}
        <Button variant="main" onClick={() => setChecking(true)}>
          {t('farmer.cropCheck')}
        </Button>
      </main>
    </>
  )
}
