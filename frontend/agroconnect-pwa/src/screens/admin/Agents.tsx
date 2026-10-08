import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useT } from '../../i18n/context'
import { AgentList } from './AgentList'
import { CoordinatorList } from './CoordinatorList'

type View = 'agents' | 'coordinators'
const VIEWS: readonly View[] = ['agents', 'coordinators']

/** The admin's team screen: approve field agents, and add and manage coordinators. */
export function Agents() {
  const { t } = useT()
  const [view, setView] = useState<View>('agents')

  return (
    <>
      <ScreenHeader title={t('agents.title')} />
      <main className="screen-body">
        <div className="pill-row">
          {VIEWS.map((option) => (
            <button key={option} type="button" className={option === view ? 'pill pill-on-green is-selected' : 'pill pill-on-green'} aria-pressed={option === view} onClick={() => setView(option)}>
              {t(`agents.view.${option}`)}
            </button>
          ))}
        </div>
        {view === 'agents' ? <AgentList /> : <CoordinatorList />}
      </main>
    </>
  )
}
