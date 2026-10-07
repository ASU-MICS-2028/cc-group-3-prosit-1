import { useCurrentUser } from '../../auth/useCurrentUser'
import { CountryPicker } from '../../components/CountryPicker'
import { LanguagePicker } from '../../components/LanguagePicker'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SignOutButton } from '../../components/SignOutButton'
import { useT } from '../../i18n/context'

export function Me() {
  const { t } = useT()
  const user = useCurrentUser()

  return (
    <>
      <ScreenHeader title={t('me.title')} subtitle={user?.name || undefined} />
      <main className="screen-body">
        <section className="card">
          <dl className="detail-list">
            <div className="detail-row">
              <dt>{t('me.phone')}</dt>
              <dd>{user?.phone}</dd>
            </div>
            <div className="detail-row">
              <dt>{t('me.role')}</dt>
              <dd>{user && t(`role.${user.role}`)}</dd>
            </div>
            <div className="detail-row">
              <dt>{t('me.consent')}</dt>
              <dd>{t('me.consentNote')}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h2 className="card-title">{t('me.profile')}</h2>
          <p>{t('me.noProfile')}</p>
        </section>

        <section className="card form">
          <LanguagePicker />
          <CountryPicker />
        </section>

        <SignOutButton />
      </main>
    </>
  )
}
