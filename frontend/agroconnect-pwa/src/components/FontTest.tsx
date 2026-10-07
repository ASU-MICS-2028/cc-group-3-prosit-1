const LETTERS = 'Ɛɛ Ɔɔ Ŋŋ Ɖɖ Ƒƒ Ɣɣ Ʋʋ Ʒʒ'
const TONES = 'à é î õ ü ɛ̀ ɛ́ ɔ̂ ɔ̃ ɔ̈'
const CEDI = '₵ 25.50 · ₵ 1,200'

/** Development aid: shown with `npm run dev`, or in a build by adding ?fonttest to the URL. Not translated on purpose. */
export function FontTest() {
  const visible = import.meta.env.DEV || new URLSearchParams(location.search).has('fonttest')
  if (!visible) return null

  return (
    <section className="font-test" aria-label="Font test">
      <h2>Font test (development only)</h2>
      <p>Letters: {LETTERS}</p>
      <p>Tone marks: {TONES}</p>
      <p>Cedi: {CEDI}</p>
      <p style={{ fontWeight: 300 }}>Light 300: Akwaaba, yɛfrɛ wo Ɛfua Ɔbɛng</p>
      <p>Regular 400: Akwaaba, yɛfrɛ wo Ɛfua Ɔbɛng</p>
      <p className="test-stat">1 234 567 {CEDI}</p>
    </section>
  )
}
