import { useAuth } from '../../auth/context'
import { Button } from '../../components/Button'
import { CountryPicker } from '../../components/CountryPicker'
import { LanguagePicker } from '../../components/LanguagePicker'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useT } from '../../i18n/context'

export function Settings({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  const { signOut } = useAuth()
  return (
    <>
      <ScreenHeader title={t('settings.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <LanguagePicker />
          <CountryPicker />
        </section>
        <Button onClick={() => void signOut()}>{t('auth.signOut')}</Button>
      </main>
    </>
  )
}
