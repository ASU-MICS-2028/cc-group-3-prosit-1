import { useCurrentUser } from '../../auth/useCurrentUser'
import { CountryPicker } from '../../components/CountryPicker'
import { useCachedRemote } from '../../hooks/useCachedRemote'
import { LanguagePicker } from '../../components/LanguagePicker'
import { ScreenHeader } from '../../components/ScreenHeader'
import { SignOutButton } from '../../components/SignOutButton'
import { useT } from '../../i18n/context'
import type { TranslationKey } from '../../i18n/translate'
import { fetchMyProfile, isFarmerProfile } from '../../profile/profileApi'

export function Me() {
  const { t } = useT()
  const user = useCurrentUser()
  const { state: profile } = useCachedRemote('myProfile', fetchMyProfile, isFarmerProfile)
  const record = profile.status === 'ready' ? profile.data : null

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
          {record ? (
            <dl className="detail-list">
              <div className="detail-row">
                <dt>{t('reg.name')}</dt>
                <dd>{record.name}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('reg.community')}</dt>
                <dd>{[record.community, record.region].filter(Boolean).join(', ') || t('detail.notSet')}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('reg.crops')}</dt>
                <dd>{record.crops.map((crop) => t(`crop.${crop}` as TranslationKey)).join(', ') || t('detail.notSet')}</dd>
              </div>
              <div className="detail-row">
                <dt>{t('reg.farmSize')}</dt>
                <dd>{record.farmSizeAcres === null ? t('detail.notSet') : t('detail.acres', { n: record.farmSizeAcres })}</dd>
              </div>
            </dl>
          ) : (
            <p>{profile.status === 'loading' ? t('common.loading') : t('me.noProfile')}</p>
          )}
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
