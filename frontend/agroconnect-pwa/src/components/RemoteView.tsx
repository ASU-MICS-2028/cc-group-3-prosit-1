import type { ReactNode } from 'react'
import type { RemoteState } from '../hooks/useRemote'
import { useT } from '../i18n/context'
import { NetworkError, RejectedError, ServerError, UnauthorizedError } from '../lib/http'
import { Button } from './Button'

interface RemoteViewProps<T> {
  state: RemoteState<T>
  onRetry: () => void
  children: (data: T) => ReactNode
}

export function RemoteView<T>({ state, onRetry, children }: RemoteViewProps<T>) {
  const { t } = useT()

  if (state.status === 'loading') return <p role="status">{t('common.loading')}</p>
  if (state.status === 'ready') return <>{children(state.data)}</>

  const { error } = state
  const offline = error instanceof NetworkError || error instanceof ServerError || error instanceof UnauthorizedError
  return (
    <>
      <p className="note" role="alert">
        {offline || !(error instanceof RejectedError) ? t('common.needsSignal') : error.message}
      </p>
      <Button onClick={onRetry}>{t('common.retry')}</Button>
    </>
  )
}
