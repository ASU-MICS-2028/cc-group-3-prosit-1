import { lazy, Suspense, type ReactNode } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { I18nProvider } from './i18n/I18nProvider'
import { useT } from './i18n/context'
import { SettingsProvider } from './settings/SettingsProvider'
import { PinUnlock } from './screens/auth/PinUnlock'
import { SetPin } from './screens/auth/SetPin'
import { SignedOutFlow } from './screens/auth/SignedOutFlow'
import { WaitingForApproval } from './screens/auth/WaitingForApproval'

// Each role's app is its own chunk, so a farmer on 2G downloads the farmer app only before first use.
// The service worker still precaches every chunk afterwards, so all of it works offline.
const FarmerApp = lazy(() => import('./apps/FarmerApp').then((m) => ({ default: m.FarmerApp })))
const StaffApp = lazy(() => import('./apps/StaffApp').then((m) => ({ default: m.StaffApp })))
const AdminApp = lazy(() => import('./apps/AdminApp').then((m) => ({ default: m.AdminApp })))

function Loading() {
  const { t } = useT()
  return (
    <div className="app">
      <header className="screen-header">
        <h1>{t('app.loading')}</h1>
      </header>
    </div>
  )
}

const withLoading = (app: ReactNode) => <Suspense fallback={<Loading />}>{app}</Suspense>

function Gate() {
  const { state } = useAuth()

  switch (state.status) {
    case 'loading':
      return <Loading />
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
          return withLoading(<FarmerApp />)
        case 'admin':
          return withLoading(<AdminApp />)
        case 'agent':
        case 'coordinator':
          return withLoading(<StaffApp role={state.session.user.role} />)
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
