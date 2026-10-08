import { CountryPicker } from '../../components/CountryPicker'
import { LanguagePicker } from '../../components/LanguagePicker'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SignOutButton } from '../../components/SignOutButton'
import { useT } from '../../i18n/context'
import { NotificationToggle } from '../../components/NotificationToggle'

export function Settings({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  return (
    <>
      <ScreenHeader title={t('settings.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <LanguagePicker />
          <CountryPicker />
        </section>
        <NotificationToggle />
        <SignOutButton />
      </main>
    </>
  )
}
