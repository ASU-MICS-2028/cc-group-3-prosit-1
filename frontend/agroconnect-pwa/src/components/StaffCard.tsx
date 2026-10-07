import type { ReactNode } from 'react'
import type { StaffRow } from '../admin/adminApi'
import { ASSOCIATIONS } from '../domain/auth'
import { useT } from '../i18n/context'
import { ROLE_COLOUR } from './roleColours'

const associationName = (id?: string) => ASSOCIATIONS.find((association) => association.id === id)?.name ?? id ?? ''

/** One agent or coordinator, with a role chip so the two are never confused. */
export function StaffCard({ person, children }: { person: StaffRow; children?: ReactNode }) {
  const { t } = useT()
  return (
    <li className="card agent-card">
      <span className="list-item">
        <span className="farmer-name">{person.name}</span>
        <span className="role-chip" style={{ background: ROLE_COLOUR[person.role] }}>
          {t(`role.${person.role}`)}
        </span>
      </span>
      <span className="farmer-meta">{person.phone}</span>
      <span className="farmer-meta">{associationName(person.assoc)}</span>
      <span className="farmer-meta">{person.loginId ? t('agents.id', { id: person.loginId }) : t('agents.noId')}</span>
      {children}
    </li>
  )
}
