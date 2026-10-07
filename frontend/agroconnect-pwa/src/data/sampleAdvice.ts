import type { CropId } from '../domain/farmer'

export interface AdviceCard {
  crop: CropId
  title: string
  body: string
}

/** Placeholder advice shown with a "Sample advice" label until the content service exists. */
export const SAMPLE_ADVICE: readonly AdviceCard[] = [
  { crop: 'maize', title: 'Plant at the start of the rains', body: 'Sow when the soil is moist to a hand\'s depth. Space rows 75 cm apart.' },
  { crop: 'tomato', title: 'Water at the base', body: 'Wet leaves invite blight. Water early in the morning at the foot of the plant.' },
  { crop: 'cassava', title: 'Remove weeds early', body: 'Weed at 4 and 8 weeks after planting so young plants are not crowded out.' },
  { crop: 'pepper', title: 'Pick when fully coloured', body: 'Harvest every week once peppers change colour to keep the plant producing.' },
]
