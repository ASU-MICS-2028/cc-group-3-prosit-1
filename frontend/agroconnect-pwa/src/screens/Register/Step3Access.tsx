import { ChoiceChips } from '../../components/ChoiceChips'
import { EMPTY_PROFILE, PROFILE_OPTIONS, type FarmerProfile } from '../../domain/profile'
import { useT } from '../../i18n/context'
import type { StepProps } from './stepProps'

/**
 * Technology access, financial profile, extension history and needs (Prosit brief, "Real Data
 * Requirements"). Every question is optional: tap a pill to answer, tap it again to clear.
 */
export function Step3Access({ draft, update }: StepProps) {
  const { t } = useT()
  const profile = draft.profile ?? EMPTY_PROFILE
  const set = (patch: Partial<FarmerProfile>) => update({ profile: { ...profile, ...patch } })
  const bank = profile.hasBankAccount === null ? null : profile.hasBankAccount ? 'yes' : 'no'

  return (
    <>
      <section className="card form">
        <h2 className="card-title">{t('profile.accessTitle')}</h2>
        <p className="hint">{t('profile.optional')}</p>
        <ChoiceChips legend="profile.phoneType" options={PROFILE_OPTIONS.phoneType} prefix="profile.phone" value={profile.phoneType} onChange={(v) => set({ phoneType: v as FarmerProfile['phoneType'] })} />
        <ChoiceChips legend="profile.dataPlan" options={PROFILE_OPTIONS.dataPlan} prefix="profile.data" value={profile.dataPlan} onChange={(v) => set({ dataPlan: v as FarmerProfile['dataPlan'] })} />
        <ChoiceChips legend="profile.contactChannel" options={PROFILE_OPTIONS.contactChannel} prefix="profile.channel" value={profile.contactChannel} onChange={(v) => set({ contactChannel: v as FarmerProfile['contactChannel'] })} />
      </section>

      <section className="card form">
        <h2 className="card-title">{t('profile.moneyTitle')}</h2>
        <ChoiceChips legend="profile.incomeSources" hint="reg.cropsHint" options={PROFILE_OPTIONS.incomeSources} prefix="profile.income" value={profile.incomeSources} onChange={(v) => set({ incomeSources: v as FarmerProfile['incomeSources'] })} />
        <ChoiceChips legend="profile.bankAccount" options={['yes', 'no'] as const} prefix="profile.answer" value={bank} onChange={(v) => set({ hasBankAccount: v === null ? null : v === 'yes' })} />
        <ChoiceChips legend="profile.mobileMoney" options={PROFILE_OPTIONS.mobileMoney} prefix="profile.momo" value={profile.mobileMoney} onChange={(v) => set({ mobileMoney: v as FarmerProfile['mobileMoney'] })} />
      </section>

      <section className="card form">
        <h2 className="card-title">{t('profile.supportTitle')}</h2>
        <ChoiceChips legend="profile.extensionVisit" options={PROFILE_OPTIONS.extensionVisit} prefix="profile.visit" value={profile.extensionVisit} onChange={(v) => set({ extensionVisit: v as FarmerProfile['extensionVisit'] })} />
        <ChoiceChips legend="profile.needs" hint="reg.cropsHint" options={PROFILE_OPTIONS.needs} prefix="profile.need" value={profile.needs} onChange={(v) => set({ needs: v as FarmerProfile['needs'] })} />
      </section>
    </>
  )
}
