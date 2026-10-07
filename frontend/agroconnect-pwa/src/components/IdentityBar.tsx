import { useEffect } from 'react'
import { useCurrentUser } from '../auth/useCurrentUser'
import { useT } from '../i18n/context'
import { initialsOf } from '../lib/initials'
import { ROLE_COLOUR } from './roleColours'
import { SignOutButton } from './SignOutButton'

const APP_TITLE = 'AgroConnect Ghana'

/** Always visible at the top of a signed-in screen: who you are and which kind of user. */
export function IdentityBar() {
  const { t } = useT()
  const user = useCurrentUser()

  const role = user ? t(`role.${user.role}`) : ''
  const name = user?.name.trim() || user?.phone || role
  const identifier = user?.loginId || user?.phone || ''

  useEffect(() => {
    if (!user) return
    document.title = `${role} · ${name} · ${APP_TITLE}`
    return () => {
      document.title = APP_TITLE
    }
  }, [user, role, name])

  if (!user) return null

  return (
    <div className="identity-bar" role="banner" aria-label={t('identity.signedInAs', { name, role })}>
      <span className="avatar" style={{ background: ROLE_COLOUR[user.role] }} aria-hidden="true">
        {initialsOf(user.name, role)}
      </span>
      <span className="identity-text">
        <span className="identity-name">{name}</span>
        <span className="identity-line">
          <span className="role-chip" style={{ background: ROLE_COLOUR[user.role] }}>
            {role}
          </span>
          {identifier && identifier !== name && <span className="identity-id">{identifier}</span>}
        </span>
      </span>
      <SignOutButton variant="text" className="identity-signout" />
    </div>
  )
}
