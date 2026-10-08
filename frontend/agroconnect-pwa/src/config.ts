export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
export const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? API_URL
export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? AUTH_URL
export const PAYMENTS_URL = import.meta.env.VITE_PAYMENTS_URL ?? API_URL
export const ADVICE_URL = import.meta.env.VITE_ADVICE_URL ?? ADMIN_URL
export const LISTINGS_URL = import.meta.env.VITE_LISTINGS_URL ?? ADMIN_URL
