import type { Currency } from './country'

export const PAYMENT_DIRECTIONS = ['collect', 'payout'] as const
/** `collect` takes money from the farmer's mobile money; `payout` sends money to it. */
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number]

export const PAYMENT_NETWORKS = ['mtn', 'telecel', 'airteltigo', 'mpesa', 'bank_transfer'] as const
export type PaymentNetwork = (typeof PAYMENT_NETWORKS)[number]

export const NETWORKS_BY_CURRENCY: Record<Currency, readonly PaymentNetwork[]> = {
  GHS: ['mtn', 'telecel', 'airteltigo'],
  KES: ['mpesa'],
  NGN: ['bank_transfer'],
}

export const MAX_PAYMENT_AMOUNT = 10_000
export const MAX_LOAN_AMOUNT = 50_000
export const MAX_PURPOSE_LENGTH = 200

export type PaymentStatus = 'pending' | 'successful' | 'failed'

export interface PaymentView {
  id: string
  clientId: string
  direction: PaymentDirection
  amount: number
  currency: Currency
  network: PaymentNetwork
  phone: string
  status: PaymentStatus
  createdAt: string
}

export interface BalanceRow {
  currency: Currency
  received: number
  paid: number
  amount: number
}

export interface Wallet {
  balance: BalanceRow[]
  items: PaymentView[]
}

export const isWallet = (value: unknown): value is Wallet =>
  typeof value === 'object' && value !== null && Array.isArray((value as Wallet).balance) && Array.isArray((value as Wallet).items)
