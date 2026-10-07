import { useState } from 'react'
import { applyCoordinatorAction, listCoordinators, type CoordinatorAction, type StaffRow } from '../../admin/adminApi'
import { describeAuthError } from '../../auth/describeError'
import { Button } from '../../components/Button'
import { RemoteView } from '../../components/RemoteView'
import { StaffCard } from '../../components/StaffCard'
import { SyncBadge } from '../../components/SyncBadge'
import { useRemote } from '../../hooks/useRemote'
import { useT } from '../../i18n/context'
import { AddCoordinatorForm } from './AddCoordinatorForm'

export function CoordinatorList() {
  const { t } = useT()
  const { state, reload } = useRemote(listCoordinators)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(person: StaffRow, action: CoordinatorAction) {
    setBusyId(person.id)
    setError(null)
    try {
      await applyCoordinatorAction(person.id, action)
      reload()
    } catch (failure) {
      setError(describeAuthError(failure, t))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {adding ? (
        <AddCoordinatorForm onCreated={reload} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="main" onClick={() => setAdding(true)}>
          {t('coordinators.add')}
        </Button>
      )}

      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}

      <RemoteView state={state} onRetry={reload}>
        {(people) =>
          people.length === 0 ? (
            <p className="note">{t('coordinators.empty')}</p>
          ) : (
            <ul className="plain-list">
              {people.map((person) => {
                const suspended = person.status === 'suspended'
                return (
                  <StaffCard key={person.id} person={person}>
                    <SyncBadge status={suspended ? 'attention' : 'sent'} label={t(suspended ? 'agents.status.suspended' : 'agents.status.approved')} />
                    <span className="agent-actions">
                      <Button disabled={busyId === person.id} onClick={() => void act(person, suspended ? 'reinstate' : 'suspend')}>
                        {t(suspended ? 'agents.reinstate' : 'agents.suspend')}
                      </Button>
                    </span>
                  </StaffCard>
                )
              })}
            </ul>
          )
        }
      </RemoteView>
    </>
  )
}
