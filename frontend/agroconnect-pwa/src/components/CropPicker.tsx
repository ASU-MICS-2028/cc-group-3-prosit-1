import { CROP_IDS, type CropId } from '../domain/farmer'
import { CropChip } from './CropChip'

interface CropPickerProps {
  value: CropId | null
  onChange: (crop: CropId) => void
}

/** Pick exactly one crop from the picture chips. */
export function CropPicker({ value, onChange }: CropPickerProps) {
  return (
    <div className="crop-grid">
      {CROP_IDS.map((crop) => (
        <CropChip key={crop} crop={crop} selected={value === crop} onToggle={onChange} />
      ))}
    </div>
  )
}
