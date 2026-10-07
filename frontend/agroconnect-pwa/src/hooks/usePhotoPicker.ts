import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { compressPhoto } from '../lib/compressPhoto'

export type PhotoPickerState = 'idle' | 'working' | 'failed'

/** Shrinks a camera picture to about 100 KB and hands back the result. Pair it with <PhotoButton>. */
export function usePhotoPicker(photo: Blob | null, onChange: (photo: Blob) => void) {
  const [state, setState] = useState<PhotoPickerState>('idle')

  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  async function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setState('working')
    try {
      onChange(await compressPhoto(file))
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return { state, url, onPicked }
}
