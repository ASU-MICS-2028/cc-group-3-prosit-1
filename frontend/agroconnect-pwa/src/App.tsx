import { AdminApp } from './apps/AdminApp'
import { FarmerApp } from './apps/FarmerApp'
import { StaffApp } from './apps/StaffApp'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { I18nProvider } from './i18n/I18nProvider'
import { useT } from './i18n/context'
import { SettingsProvider } from './settings/SettingsProvider'
import { PinUnlock } from './screens/auth/PinUnlock'
import { SetPin } from './screens/auth/SetPin'
import { SignedOutFlow } from './screens/auth/SignedOutFlow'
import { WaitingForApproval } from './screens/auth/WaitingForApproval'

function Gate() {
  const { t } = useT()
  const { state } = useAuth()

  switch (state.status) {
    case 'loading':
      return (
        <div className="app">
          <header className="screen-header">
            <h1>{t('app.loading')}</h1>
          </header>
        </div>
      )
    case 'signedOut':
      return <SignedOutFlow notice={state.notice} />
    case 'waitingApproval':
      return <WaitingForApproval />
    case 'settingPin':
      return <SetPin role={state.session.user.role} />
    case 'locked':
      return <PinUnlock user={state.session.user} />
    case 'signedIn':
      switch (state.session.user.role) {
        case 'farmer':
          return <FarmerApp />
        case 'admin':
          return <AdminApp />
        case 'agent':
        case 'coordinator':
          return <StaffApp role={state.session.user.role} />
      }
  }
}

export function App() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SettingsProvider>
    </I18nProvider>
  )
}
