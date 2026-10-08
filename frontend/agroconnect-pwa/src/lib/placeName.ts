import type { TranslationKey } from '../i18n/translate'
import { HERE_ID, type Place } from '../domain/weather'

/** Town names are proper nouns and stay as they are. The phone's own position shows its looked-up name, or a plain label until it has one. */
export const placeName = (place: Place, t: (key: TranslationKey) => string) => (place.id === HERE_ID && !place.name ? t('weather.here') : place.name)
