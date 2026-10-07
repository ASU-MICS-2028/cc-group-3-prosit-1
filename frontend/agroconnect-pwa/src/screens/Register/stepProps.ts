import type { Draft } from '../../domain/farmer'
import type { FieldName } from '../../domain/validation'

export interface StepProps {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  errors: Partial<Record<FieldName, string>>
}
