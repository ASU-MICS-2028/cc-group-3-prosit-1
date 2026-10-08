import { isEmptyProfile, type FarmerProfile } from '../domain/profile'
import { useT } from '../i18n/context'
import type { TranslationKey } from '../i18n/translate'

/** [field, label key, option-label prefix] in the order the agent asked them. */
const ROWS: [keyof FarmerProfile, TranslationKey, string][] = [
  ['soilType', 'profile.soilType', 'profile.soil'],
  ['seasons', 'profile.seasons', 'profile.season'],
  ['phoneType', 'profile.phoneType', 'profile.phone'],
  ['dataPlan', 'profile.dataPlan', 'profile.data'],
  ['contactChannel', 'profile.contactChannel', 'profile.channel'],
  ['incomeSources', 'profile.incomeSources', 'profile.income'],
  ['hasBankAccount', 'profile.bankAccount', 'profile.answer'],
  ['mobileMoney', 'profile.mobileMoney', 'profile.momo'],
  ['extensionVisit', 'profile.extensionVisit', 'profile.visit'],
  ['needs', 'profile.needs', 'profile.need'],
]

/** The answered profile questions as detail rows; nothing when none were answered. */
export function ProfileRows({ profile }: { profile: FarmerProfile | undefined }) {
  const { t } = useT()
  if (!profile || isEmptyProfile(profile)) return null
  return (
    <>
      {ROWS.map(([field, label, prefix]) => {
        const raw = profile[field]
        const values = Array.isArray(raw) ? raw : raw === null ? [] : [typeof raw === 'boolean' ? (raw ? 'yes' : 'no') : raw]
        if (values.length === 0) return null
        return (
          <div key={field} className="detail-row">
            <dt>{t(label)}</dt>
            <dd>{values.map((value) => t(`${prefix}.${value}` as TranslationKey)).join(', ')}</dd>
          </div>
        )
      })}
    </>
  )
}
