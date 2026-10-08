import { useState } from 'react'
import { Button } from '../../components/Button'
import { CountryPicker } from '../../components/CountryPicker'
import { LanguagePicker } from '../../components/LanguagePicker'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SignOutButton } from '../../components/SignOutButton'
import { useT } from '../../i18n/context'
import { NotificationToggle } from '../../components/NotificationToggle'
import { InstallButton } from '../../components/InstallButton'
import { ChangePassword } from './ChangePassword'

export function Settings({ onBack }: { onBack?: () => void }) {
  const { t } = useT()
  const [view, setView] = useState<'main' | 'password'>('main')

  if (view === 'password') return <ChangePassword onBack={() => setView('main')} />

  return (
    <>
      <ScreenHeader title={t('settings.title')} onBack={onBack} />
      <main className="screen-body">
        <section className="card form">
          <LanguagePicker />
          <CountryPicker />
        </section>
        <Button onClick={() => setView('password')}>{t('settings.changePassword')}</Button>
        <NotificationToggle />
        <InstallButton />
        <SignOutButton />
      </main>
    </>
  )
}
