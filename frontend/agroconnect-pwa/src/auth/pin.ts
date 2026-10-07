import type { PinRecord } from '../domain/auth'

const ITERATIONS = 120_000
const SALT_BYTES = 16

export class PinUnavailableError extends Error {
  constructor() {
    super('Web Crypto is not available. Serve the app over HTTPS or from localhost.')
  }
}

export const isValidPin = (pin: string, length: number): boolean => new RegExp(`^\\d{${length}}$`).test(pin)

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new PinUnavailableError()
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPin(pin: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return { salt: toBase64(salt), hash: toBase64(await derive(pin, salt, ITERATIONS)), iterations: ITERATIONS }
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const actual = await derive(pin, fromBase64(record.salt), record.iterations)
  const expected = fromBase64(record.hash)
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < actual.length; i++) difference |= (actual[i] ?? 0) ^ (expected[i] ?? 0)
  return difference === 0
}
