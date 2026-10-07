import { useState } from 'react'
import { useAuth } from '../auth/context'
import { useT } from '../i18n/context'
import { Button } from './Button'

interface SignOutButtonProps {
  variant?: 'secondary' | 'text'
  className?: string
}

/**
 * Asks before signing out, because signing in again needs signal, and an agent in the field may not
 * have any. The safe choice, staying signed in, is the main button.
 */
export function SignOutButton({ variant = 'secondary', className }: SignOutButtonProps) {
  const { t } = useT()
  const { signOut } = useAuth()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setConfirming(true)}>
        {t('auth.signOut')}
      </Button>

      {confirming && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={t('identity.confirmTitle')}>
          <div className="card sheet-body form">
            <h2 className="card-title">{t('identity.confirmTitle')}</h2>
            <p>{t('identity.confirmBody')}</p>
            <Button variant="main" onClick={() => setConfirming(false)}>
              {t('identity.stay')}
            </Button>
            <Button onClick={() => void signOut()}>{t('auth.signOut')}</Button>
          </div>
        </div>
      )}
    </>
  )
}
