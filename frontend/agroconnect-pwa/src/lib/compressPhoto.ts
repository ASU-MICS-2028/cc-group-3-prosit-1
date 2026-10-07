const MAX_BYTES = 100 * 1024
const START_LONG_EDGE = 800
const SHRINK_FACTOR = 0.8
const MAX_ROUNDS = 6
const QUALITIES = [0.7, 0.55, 0.4]

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas could not encode the image'))), 'image/jpeg', quality)
  })
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Older WebViews reject the options object.
    return createImageBitmap(file)
  }
}

/** Re-encodes as JPEG, shrinking dimensions and quality until it fits in about 100 KB. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await decode(file)
  try {
    let scale = Math.min(1, START_LONG_EDGE / Math.max(bitmap.width, bitmap.height))
    let smallest: Blob | null = null

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      for (const quality of QUALITIES) {
        const blob = await toBlob(canvas, quality)
        if (blob.size <= MAX_BYTES) return blob
        smallest = blob
      }
      scale *= SHRINK_FACTOR
    }

    if (!smallest) throw new Error('Photo could not be compressed')
    return smallest
  } finally {
    bitmap.close()
  }
}
