import { useState } from 'react'
import { Button } from '../../components/Button'
import { CropArt } from '../../components/CropArt'
import { CROP_BACKGROUND } from '../../components/cropColours'
import { SampleBadge } from '../../components/SampleBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SAMPLE_ADVICE } from '../../data/sampleAdvice'
import { useT } from '../../i18n/context'
import { CropCheckForm } from './CropCheckForm'

export function Advice() {
  const { t } = useT()
  const [checking, setChecking] = useState(false)

  if (checking) return <CropCheckForm onBack={() => setChecking(false)} />

  return (
    <>
      <ScreenHeader title={t('advice.title')} />
      <main className="screen-body">
        <SampleBadge label="common.sampleAdvice" />
        {SAMPLE_ADVICE.map((card) => (
          <article key={card.title} className="card advice-card">
            <span className="crop-tile" style={{ background: CROP_BACKGROUND[card.crop] }}>
              <CropArt crop={card.crop} size={44} />
            </span>
            <div>
              <p className="card-title">{card.title}</p>
              <p>{card.body}</p>
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
