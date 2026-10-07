import { CropChip } from '../../components/CropChip'
import { Field } from '../../components/Field'
import { CROP_IDS, type CropId } from '../../domain/farmer'
import { REGIONS } from '../../domain/regions'
import { useT } from '../../i18n/context'
import type { StepProps } from './stepProps'

export function Step2Farm({ draft, update, errors }: StepProps) {
  const { t } = useT()

  function toggleCrop(crop: CropId) {
    const crops = draft.crops.includes(crop) ? draft.crops.filter((c) => c !== crop) : [...draft.crops, crop]
    update({ crops })
  }

  return (
    <div className="card form">
      <Field label={t('reg.community')} htmlFor="f-community">
        <input
          id="f-community"
          className="input"
          type="text"
          autoComplete="off"
          value={draft.community}
          onChange={(e) => update({ community: e.target.value })}
        />
      </Field>

      <Field label={t('reg.region')} htmlFor="f-region">
        <select id="f-region" className="input" value={draft.region} onChange={(e) => update({ region: e.target.value })}>
          <option value="">{t('reg.regionPlaceholder')}</option>
          {REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('reg.farmSize')} error={errors.farmSize} htmlFor="f-size">
        <input
          id="f-size"
          className="input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft.farmSizeAcres}
          onChange={(e) => update({ farmSizeAcres: e.target.value })}
        />
      </Field>

      <fieldset className="field">
        <legend className="label">{t('reg.crops')}</legend>
        <p className="hint">{t('reg.cropsHint')}</p>
        <div className="crop-grid">
          {CROP_IDS.map((crop) => (
            <CropChip key={crop} crop={crop} selected={draft.crops.includes(crop)} onToggle={toggleCrop} />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
