import type { ReactElement } from 'react'
import { LanguagePicker } from '../../components/LanguagePicker'
import type { SignOutNotice } from '../../domain/auth'
import { useT } from '../../i18n/context'

interface RoleChoiceProps {
  notice?: SignOutNotice
  onFarmer: () => void
  onStaff: () => void
}

const SPROUT: ReactElement = (
  <>
    <path d="M12 21v-9" />
    <path d="M12 12c0-4-2.5-6.5-7-6.5 0 4 2.5 6.5 7 6.5z" />
    <path d="M12 14c0-3.5 2.2-6 6.5-6 0 3.8-2.4 6-6.5 6z" />
  </>
)

const BADGE: ReactElement = (
  <>
    <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
    <circle cx="12" cy="10" r="2.5" />
    <path d="M8 17c.6-2 2.2-3 4-3s3.4 1 4 3" />
  </>
)

function RoleButton({ icon, title, hint, onClick }: { icon: ReactElement; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="card role-button" onClick={onClick}>
      <span className="role-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon}
        </svg>
      </span>
      <span className="role-text">
        <span className="role-title">{title}</span>
        <span className="role-hint">{hint}</span>
      </span>
    </button>
  )
}

export function RoleChoice({ notice, onFarmer, onStaff }: RoleChoiceProps) {
  const { t } = useT()
  return (
    <div className="app">
      <header className="screen-header">
        <h1>{t('app.name')}</h1>
      </header>
      <main className="screen-body">
        {notice && (
          <p className="note" role="alert">
            {t(`auth.notice.${notice}`)}
          </p>
        )}
        <RoleButton icon={SPROUT} title={t('auth.choose.farmer')} hint={t('auth.choose.farmerHint')} onClick={onFarmer} />
        <RoleButton icon={BADGE} title={t('auth.choose.staff')} hint={t('auth.choose.staffHint')} onClick={onStaff} />
        <section className="card">
          <LanguagePicker />
        </section>
      </main>
    </div>
  )
}
