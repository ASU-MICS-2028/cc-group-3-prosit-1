import { useCallback, useState } from 'react'
import { AGENT_STATUSES, applyAgentAction, listAgents, type AgentAction, type AgentRow, type AgentStatus } from '../../admin/adminApi'
import { Button } from '../../components/Button'
import { RemoteView } from '../../components/RemoteView'
import { ScreenHeader } from '../../components/ScreenHeader'
import { ASSOCIATIONS } from '../../domain/auth'
import { useRemote } from '../../hooks/useRemote'
import { useT } from '../../i18n/context'
import { describeAuthError } from '../../auth/describeError'

const ACTIONS: Record<AgentStatus, readonly AgentAction[]> = {
  pending: ['approve', 'reject'],
  approved: ['suspend'],
  suspended: ['reinstate'],
  rejected: [],
}

const associationName = (id?: string) => ASSOCIATIONS.find((association) => association.id === id)?.name ?? id ?? ''

export function Agents() {
  const { t } = useT()
  const [status, setStatus] = useState<AgentStatus>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => listAgents(status), [status])
  const { state, reload } = useRemote(load)

  async function act(agent: AgentRow, action: AgentAction) {
    setBusyId(agent.id)
    setError(null)
    try {
      await applyAgentAction(agent.id, action)
      reload()
    } catch (failure) {
      setError(describeAuthError(failure, t))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ScreenHeader title={t('agents.title')} />
      <main className="screen-body">
        <div className="pill-row">
          {AGENT_STATUSES.map((value) => (
            <button key={value} type="button" className={value === status ? 'pill pill-on-green is-selected' : 'pill pill-on-green'} aria-pressed={value === status} onClick={() => setStatus(value)}>
              {t(`agents.status.${value}`)}
            </button>
          ))}
        </div>

        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}

        <RemoteView state={state} onRetry={reload}>
          {(agents) =>
            agents.length === 0 ? (
              <p className="note">{t('agents.empty')}</p>
            ) : (
              <ul className="plain-list">
                {agents.map((agent) => (
                  <li key={agent.id} className="card agent-card">
                    <span className="farmer-name">{agent.name}</span>
                    <span className="farmer-meta">{agent.phone}</span>
                    <span className="farmer-meta">{associationName(agent.assoc)}</span>
                    <span className="farmer-meta">{agent.loginId ? t('agents.id', { id: agent.loginId }) : t('agents.noId')}</span>
                    <span className="agent-actions">
                      {ACTIONS[status].map((action) => (
                        <Button key={action} disabled={busyId === agent.id} onClick={() => void act(agent, action)}>
                          {t(`agents.${action}`)}
                        </Button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </RemoteView>
      </main>
    </>
  )
}
