import { useState } from 'react'
import { fetchCsv, type CsvKind } from '../admin/adminApi'
import { useT } from '../i18n/context'
import { downloadBlob } from '../lib/download'
import { Button } from './Button'

const LABEL = { farmers: 'dashboard.export', payments: 'dashboard.exportPayments' } as const

interface ExportCsvButtonProps {
  kind: CsvKind
  /** The screen's one lime button is the main action; a second export is secondary. */
  variant?: 'main' | 'secondary'
}

export function ExportCsvButton({ kind, variant = 'main' }: ExportCsvButtonProps) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function exportCsv() {
    setBusy(true)
    setFailed(false)
    try {
      downloadBlob(await fetchCsv(kind), `${kind}-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {failed && (
        <p className="note" role="alert">
          {t('dashboard.exportFailed')}
        </p>
      )}
      <Button variant={variant} disabled={busy} onClick={() => void exportCsv()}>
        {busy ? t('dashboard.exporting') : t(LABEL[kind])}
      </Button>
    </>
  )
}
