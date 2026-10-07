import type { CropId } from '../domain/farmer'
import { useT } from '../i18n/context'
import { CropArt } from './CropArt'
import { CROP_BACKGROUND } from './cropColours'

interface CropChipProps {
  crop: CropId
  selected: boolean
  onToggle: (crop: CropId) => void
}

export function CropChip({ crop, selected, onToggle }: CropChipProps) {
  const { t } = useT()
  return (
    <button
      type="button"
      className={selected ? 'crop-chip is-selected' : 'crop-chip'}
      style={{ background: CROP_BACKGROUND[crop] }}
      aria-pressed={selected}
      onClick={() => onToggle(crop)}
    >
      <CropArt crop={crop} />
      <span className="crop-name">{t(`crop.${crop}`)}</span>
      {selected && (
        <span className="crop-tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      )}
    </button>
  )
}
