import { listOutboxToSend, markOutboxAttention, markOutboxSent } from '../db/outbox'
import { SENDABLE_KINDS, type AnyOutboxItem, type RemoteRef } from '../domain/outbox'
import { NetworkError, RejectedError, ServerError, UnauthorizedError } from './api'
import { postCropCheck, postFeedback, postListing, postLoanRequest, postPayment, postVisit } from './outboxApi'

async function sendItem(item: AnyOutboxItem): Promise<RemoteRef | undefined> {
  switch (item.kind) {
    case 'feedback':
      await postFeedback(item)
      return undefined
    case 'payment':
      return postPayment(item)
    case 'loanRequest':
      return postLoanRequest(item)
    case 'listing':
      return postListing(item)
    case 'cropCheck':
      return postCropCheck(item)
    case 'visit':
      return postVisit(item)
  }
}

const isTemporary = (error: unknown) =>
  error instanceof NetworkError || error instanceof ServerError || error instanceof UnauthorizedError

/**
 * Sends what the user created offline, oldest first. A refusal marks that one item "needs attention" and
 * carries on; a lost connection stops the run and leaves everything queued for next time. Every request
 * carries the item's own `clientId`, so one that reached the server but lost its reply is not repeated.
 */
export async function sendOutbox(): Promise<void> {
  for (const item of await listOutboxToSend(SENDABLE_KINDS)) {
    try {
      await markOutboxSent(item.clientId, await sendItem(item))
    } catch (error) {
      if (error instanceof RejectedError) {
        await markOutboxAttention(item.clientId, error.message)
        continue
      }
      if (isTemporary(error)) return
      throw error
    }
  }
}
