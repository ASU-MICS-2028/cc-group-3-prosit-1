import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/context'
import { chooseSource, type SpeechLang, type SpeechSource } from './speak'

interface ListenButtonProps {
  /** What to say. */
  text: string
  /** The language `text` is in (a farmer's language may differ from the app's). */
  lang: SpeechLang
  /** The translation key of `text`, so a recorded clip can be used when there is one. */
  clipKey?: string
}

function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices()))
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const update = () => setVoices(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

/** A speaker button that reads `text` aloud for people who cannot read it. Hidden when nothing can say it. */
export function ListenButton({ text, lang, clipKey }: ListenButtonProps) {
  const { t } = useT()
  const voices = useVoices()
  const source: SpeechSource = chooseSource(lang, clipKey ?? null, voices)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(
    () => () => {
      audio.current?.pause()
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    },
    [],
  )

  if (!source) return null

  function stop() {
    audio.current?.pause()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    setPlaying(false)
  }

  function play() {
    if (playing) return stop()
    if (!source) return
    if (source.kind === 'clip') {
      audio.current = new Audio(source.url)
      audio.current.onended = () => setPlaying(false)
      void audio.current.play().catch(() => setPlaying(false))
    } else {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = source.lang
      if (source.voice) utterance.voice = source.voice
      utterance.rate = 0.9
      utterance.onend = () => setPlaying(false)
      utterance.onerror = () => setPlaying(false)
      speechSynthesis.speak(utterance)
    }
    setPlaying(true)
  }

  return (
    <button type="button" className="pill listen-button" aria-pressed={playing} onClick={play}>
      <span aria-hidden="true">{playing ? '■' : '🔊'}</span> {playing ? t('audio.stop') : t('audio.listen')}
    </button>
  )
}
