import { useT } from '../i18n/context'
import { Button } from './Button'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
}

export function ScreenHeader({ title, subtitle, onBack }: ScreenHeaderProps) {
  const { t } = useT()
  return (
    <header className="screen-header">
      {onBack && (
        <Button variant="text" className="back-link" onClick={onBack}>
          ← {t('common.back')}
        </Button>
      )}
      <h1>{title}</h1>
      {subtitle && <p className="progress-label">{subtitle}</p>}
    </header>
  )
}
