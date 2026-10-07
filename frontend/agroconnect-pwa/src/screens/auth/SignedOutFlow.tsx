import { useState } from 'react'
import type { SignOutNotice } from '../../domain/auth'
import { FarmerSignIn } from './FarmerSignIn'
import { RoleChoice } from './RoleChoice'
import { StaffSignIn } from './StaffSignIn'
import { StaffSignUp } from './StaffSignUp'

type View = 'choice' | 'farmer' | 'staff' | 'signup'

export function SignedOutFlow({ notice }: { notice?: SignOutNotice }) {
  const [view, setView] = useState<View>('choice')

  switch (view) {
    case 'farmer':
      return <FarmerSignIn onBack={() => setView('choice')} />
    case 'staff':
      return <StaffSignIn notice={notice} onBack={() => setView('choice')} onSignUp={() => setView('signup')} />
    case 'signup':
      return <StaffSignUp onBack={() => setView('staff')} onDone={() => setView('staff')} />
    case 'choice':
      return <RoleChoice notice={notice} onFarmer={() => setView('farmer')} onStaff={() => setView('staff')} />
  }
}
