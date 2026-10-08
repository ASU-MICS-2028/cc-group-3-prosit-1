import { useCallback, useEffect, useRef, useState } from 'react'
import { discardDraft, getLatestDraft, newDraft, saveDraft, saveFarmer } from '../../db/repository'
import type { Draft } from '../../domain/farmer'
import { normaliseFields } from '../../domain/validation'

const AUTOSAVE_DELAY_MS = 300

/** A blank form is not worth keeping, or the app would offer to "resume" nothing. */
function hasContent(draft: Draft): boolean {
  return Boolean(draft.name || draft.phone || draft.farmSizeAcres || draft.crops.length || draft.gps || draft.photo)
}

export function useRegistrationDraft() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState<Draft | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void getLatestDraft().then((found) => {
      if (cancelled) return
      if (found) setPending(found)
      else setDraft(newDraft())
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!draft || !hasContent(draft)) return
    saveTimer.current = setTimeout(() => void saveDraft(draft), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(saveTimer.current)
  }, [draft])

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const resume = useCallback(() => {
    setDraft(pending)
    setPending(null)
  }, [pending])

  const startNew = useCallback(async () => {
    if (pending) await discardDraft(pending.clientId)
    setDraft(newDraft())
    setPending(null)
  }, [pending])

  /** Registerers usually sign up a whole community in a row, so "next" keeps community and region. */
  const submit = useCallback(
    async (options: { keepLocation: boolean }) => {
      if (!draft) return
      clearTimeout(saveTimer.current)
      await saveFarmer(normaliseFields(draft))
      setDraft(newDraft(options.keepLocation ? draft : {}))
    },
    [draft],
  )

  return { draft, pending, update, resume, startNew, submit }
}
