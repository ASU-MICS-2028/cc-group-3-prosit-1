import { useState } from 'react'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { updateFarmer } from '../../db/repository'
import { CROP_IDS, FARMER_LANGUAGES, GENDERS, isCropId, isFarmerLanguage, isGender, type Farmer } from '../../domain/farmer'
import { useT } from '../../i18n/context'
import { requestSync } from '../../sync/syncQueue'

/** Edits a farmer's details on the phone, then queues the change for the next sync. */
export function EditFarmer({ farmer, onClose, onSaved }: { farmer: Farmer; onClose: () => void; onSaved: () => void }) {
  const { t } = useT()
  const [name, setName] = useState(farmer.name)
  const [community, setCommunity] = useState(farmer.community)
  const [region, setRegion] = useState(farmer.region)
  const [language, setLanguage] = useState(farmer.preferredLanguage)
  const [gender, setGender] = useState(farmer.gender ?? '')
  const [farmSize, setFarmSize] = useState(farmer.farmSizeAcres)
  const [crops, setCrops] = useState<string[]>([...farmer.crops])
  const [consent, setConsent] = useState(farmer.consent)
  const [saving, setSaving] = useState(false)

  function toggleCrop(crop: string) {
    setCrops((current) => (current.includes(crop) ? current.filter((entry) => entry !== crop) : [...current, crop]))
  }

  async function save() {
    setSaving(true)
    await updateFarmer(farmer.clientId, {
      name: name.trim(),
      community,
      region,
      preferredLanguage: isFarmerLanguage(language) ? language : 'en',
      gender: isGender(gender) ? gender : null,
      farmSizeAcres: farmSize,
      crops: crops.filter(isCropId),
      consent,
    })
    void requestSync()
    setSaving(false)
    onSaved()
  }

  return (
    <>
      <header className="screen-header">
        <Button variant="text" className="back-link" onClick={onClose}>
          ← {t('detail.close')}
        </Button>
        <h1>{t('edit.title')}</h1>
      </header>

      <main className="screen-body">
        <section className="card form">
          <Field label={t('reg.name')} htmlFor="e-name">
            <input id="e-name" className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('reg.community')} htmlFor="e-community">
            <input id="e-community" className="input" type="text" value={community} onChange={(e) => setCommunity(e.target.value)} />
          </Field>
          <Field label={t('reg.region')} htmlFor="e-region">
            <input id="e-region" className="input" type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
          </Field>
          <Field label={t('reg.language')} htmlFor="e-language">
            <select id="e-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              {FARMER_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`lang.${lang}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('reg.gender')} htmlFor="e-gender">
            <select id="e-gender" className="input" value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
              <option value="">{t('detail.notSet')}</option>
              {GENDERS.map((value) => (
                <option key={value} value={value}>
                  {t(`gender.${value}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('reg.farmSize')} htmlFor="e-size">
            <input id="e-size" className="input" type="text" inputMode="decimal" value={farmSize} onChange={(e) => setFarmSize(e.target.value)} />
          </Field>
          <fieldset className="crop-picker">
            <legend>{t('reg.crops')}</legend>
            {CROP_IDS.map((crop) => (
              <label key={crop} className="check-row">
                <input type="checkbox" checked={crops.includes(crop)} onChange={() => toggleCrop(crop)} />
                {t(`crop.${crop}`)}
              </label>
            ))}
          </fieldset>
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {t('reg.consent')}
          </label>
        </section>

        <Button variant="main" disabled={saving} onClick={() => void save()}>
          {t('edit.save')}
        </Button>
      </main>
    </>
  )
}
