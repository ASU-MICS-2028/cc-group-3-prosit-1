import type { ReactNode } from 'react'
import { Button } from './Button'
import { useT } from '../i18n/context'

interface AuthLayoutProps {
  title: string
  onBack?: () => void
  children: ReactNode
}

export function AuthLayout({ title, onBack, children }: AuthLayoutProps) {
  const { t } = useT()
  return (
    <div className="app">
      <header className="screen-header">
        {onBack && (
          <Button variant="text" className="back-link" onClick={onBack}>
            ← {t('auth.back')}
          </Button>
        )}
        <h1>{title}</h1>
      </header>
      <main className="screen-body">{children}</main>
    </div>
  )
}
