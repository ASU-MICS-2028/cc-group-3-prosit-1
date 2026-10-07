import { useT } from '../i18n/context'
import type { TranslationKey } from '../i18n/translate'

/** Marks content that is placeholder data, so nobody mistakes it for real figures. */
export function SampleBadge({ label = 'common.sample' }: { label?: TranslationKey }) {
  const { t } = useT()
  return <span className="sample-badge">{t(label)}</span>
}
