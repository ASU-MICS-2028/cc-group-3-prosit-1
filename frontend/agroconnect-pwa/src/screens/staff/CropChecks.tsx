import { ScreenHeader } from '../../components/ScreenHeader'
import { useT } from '../../i18n/context'

export function CropChecks({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  return (
    <>
      <ScreenHeader title={t('checks.title')} onBack={onBack} />
      <main className="screen-body">
        <p className="note">{t('checks.empty')}</p>
        <section className="card">
          <p>{t('checks.hint')}</p>
        </section>
      </main>
    </>
  )
}
