/**
 * "Audio features for low-literacy users" (Prosit brief, Week 1). Two sources, best first:
 * 1. A recorded clip in public/audio/<lang>/<key>.mp3, listed in RECORDED_CLIPS. Twi and Ewe need these:
 *    phones ship no Twi or Ewe text-to-speech voice.
 * 2. The phone's own text-to-speech voice for that language (English almost everywhere).
 * When neither exists the Listen button is not shown, rather than reading Twi text in an English voice.
 */
export type SpeechLang = 'en' | 'tw' | 'ee'

/**
 * Translation keys with a recorded clip, per language. To add one: record it (phone voice memo, about
 * 64 kbps mono), save it as public/audio/<lang>/<key>.mp3, and add the key here. See public/audio/README.md.
 */
export const RECORDED_CLIPS: Record<SpeechLang, readonly string[]> = {
  en: [],
  tw: [],
  ee: [],
}

/** BCP 47 prefixes for each language: Twi is Akan (`ak`), Ewe is `ee`. Ghanaian English is preferred. */
const VOICE_LANGS: Record<SpeechLang, readonly string[]> = {
  en: ['en-GH', 'en-NG', 'en-KE', 'en-GB', 'en'],
  tw: ['ak', 'tw'],
  ee: ['ee'],
}

export type SpeechSource = { kind: 'clip'; url: string } | { kind: 'voice'; voice: SpeechSynthesisVoice | null; lang: string } | null

/** Picks how to say `key` (or free text) in `lang`, given the voices this phone has. */
export function chooseSource(lang: SpeechLang, key: string | null, voices: readonly Pick<SpeechSynthesisVoice, 'lang'>[], recorded = RECORDED_CLIPS): SpeechSource {
  if (key && recorded[lang].includes(key)) return { kind: 'clip', url: `/audio/${lang}/${key}.mp3` }
  for (const prefix of VOICE_LANGS[lang]) {
    const voice = voices.find((v) => v.lang.toLowerCase() === prefix.toLowerCase() || v.lang.toLowerCase().startsWith(`${prefix.toLowerCase()}-`))
    if (voice) return { kind: 'voice', voice: voice as SpeechSynthesisVoice, lang: voice.lang }
  }
  // Some Android builds report no voice list but still speak English through the default engine.
  if (lang === 'en' && typeof speechSynthesis !== 'undefined' && voices.length === 0) return { kind: 'voice', voice: null, lang: 'en-GB' }
  return null
}

export const speechAvailable = () => typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined')
