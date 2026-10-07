import { useState } from 'react'
import { useT } from '../i18n/context'
import { FeedbackForm } from './FeedbackForm'
import { Icon } from './icons'

/** A small floating button on every signed-in screen that opens the feedback form. */
export function FeedbackButton({ screen }: { screen: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="feedback-fab" aria-label={t('feedback.open')} onClick={() => setOpen(true)}>
        <Icon name="feedback" size={24} />
      </button>
      {open && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={t('feedback.title')}>
          <div className="card sheet-body">
            <h2 className="card-title">{t('feedback.title')}</h2>
            <FeedbackForm screen={screen} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
