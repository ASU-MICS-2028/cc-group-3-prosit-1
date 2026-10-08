import { useT } from '../i18n/context'
import { promptInstall, useInstallState } from '../pwa/installPrompt'
import { Button } from './Button'

/** Puts AgroConnect on the home screen in one tap (Android), or explains how (iPhone). Hidden once installed. */
export function InstallButton() {
  const { t } = useT()
  const state = useInstallState()
  if (state === 'none') return null
  if (state === 'ios') return <p className="note">{t('install.iosHint')}</p>
  return <Button onClick={() => void promptInstall()}>{t('install.button')}</Button>
}
