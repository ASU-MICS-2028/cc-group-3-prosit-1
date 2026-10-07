import type { ReactElement } from 'react'
import type { CropId } from '../domain/farmer'

const DRAWINGS: Record<CropId, ReactElement> = {
  maize: (
    <>
      <path d="M32 6c9 7 12 22 9 38-2 8-5 12-9 14-4-2-7-6-9-14-3-16 0-31 9-38z" fill="#F7D84A" />
      <path d="M32 10v46M24 22h16M23 32h18M24 42h16" stroke="#D9A91E" strokeWidth="2" fill="none" />
      <path d="M32 60C20 56 14 44 14 30c8 4 14 12 18 30zM32 60c12-4 18-16 18-30-8 4-14 12-18 30z" fill="#3E7D3A" />
    </>
  ),
  tomato: (
    <>
      <circle cx="32" cy="36" r="21" fill="#D1362B" />
      <path d="M32 15l5 7 8-3-3 8 7 4-8 2-1 8-8-5-8 5-1-8-8-2 7-4-3-8 8 3z" fill="#3E7D3A" />
    </>
  ),
  cassava: (
    <>
      <path d="M10 46c8-4 28-20 42-34 3-3 7 0 5 4-6 16-24 34-40 40-6 2-11-6-7-10z" fill="#8A5A3B" />
      <path d="M13 50c8-4 26-18 40-32" stroke="#E8D3A8" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  pepper: (
    <>
      <path d="M22 18c12-4 26 4 26 22 0 10-6 16-12 18-2-14-6-22-14-26z" fill="#C8321F" />
      <path d="M22 18c-2-6 2-10 8-10" stroke="#3E7D3A" strokeWidth="5" strokeLinecap="round" fill="none" />
    </>
  ),
  okro: (
    <>
      <path d="M26 14h12l4 10-10 36-10-36z" fill="#3F8F3A" />
      <path d="M32 24v32M28 24l4 30M36 24l-4 30" stroke="#2A6A2A" strokeWidth="1.5" fill="none" />
      <path d="M24 14c0-6 4-8 8-8s8 2 8 8z" fill="#2A6A2A" />
    </>
  ),
  yam: (
    <>
      <ellipse cx="32" cy="34" rx="22" ry="15" transform="rotate(-25 32 34)" fill="#6B4A32" />
      <path d="M18 40c6-2 10-6 14-12M26 46c6-2 12-8 16-14M30 32c4-2 8-6 10-10" stroke="#A9825E" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  cocoa: (
    <>
      <path d="M32 6c14 6 20 22 14 38-3 8-8 14-14 14S21 52 18 44C12 28 18 12 32 6z" fill="#B8601F" />
      <path d="M32 8v48M24 14c-4 12-4 28 0 38M40 14c4 12 4 28 0 38" stroke="#7E3F12" strokeWidth="2" fill="none" />
    </>
  ),
  plantain: (
    <>
      <path d="M8 22c10 14 26 22 46 22 0 6-4 10-10 12C26 56 8 44 8 22z" fill="#6E9A2F" />
      <path d="M14 22c10 12 24 18 40 20" stroke="#4E7A1F" strokeWidth="2" fill="none" />
      <path d="M8 22c-2-4 0-8 4-8" stroke="#3E5A1A" strokeWidth="4" strokeLinecap="round" fill="none" />
    </>
  ),
}

export function CropArt({ crop, size = 56 }: { crop: CropId; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {DRAWINGS[crop]}
    </svg>
  )
}
