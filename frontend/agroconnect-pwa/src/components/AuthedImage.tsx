import { useEffect, useState } from 'react'

interface AuthedImageProps {
  /** Must be stable (wrap it in useCallback), or the picture is fetched again on every render. */
  load: () => Promise<Blob>
  alt: string
}

/** A picture that needs the sign-in header to fetch, shown from memory. It stays blank if it cannot be loaded. */
export function AuthedImage({ load, alt }: AuthedImageProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    load().then(
      (blob) => {
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [load])

  return url ? <img className="thumb" src={url} alt={alt} width="96" height="96" /> : <span className="thumb" aria-hidden="true" />
}
