import type { Role } from '../domain/auth'

/** One colour per role, borrowed from the crop palette, so a role is recognised at a glance. Never lime. */
export const ROLE_COLOUR: Record<Role, string> = {
  farmer: '#F2B84B',
  agent: '#7FB88A',
  coordinator: '#F28B7A',
  admin: '#B58A6A',
}
