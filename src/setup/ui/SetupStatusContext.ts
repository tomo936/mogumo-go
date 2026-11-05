import { createContext, useContext } from 'react'

export type SetupStatus = {
  loading: boolean
  error: boolean
  hasProfile: boolean
  hasHome: boolean
  markProfileCreated(): void
  markHomeSaved(): void
  retry(): void
}

export const SetupStatusContext = createContext<SetupStatus | null>(null)

export function useSetupStatus(): SetupStatus {
  const value = useContext(SetupStatusContext)
  if (!value) throw new Error('useSetupStatus must be used inside SetupStatusProvider')
  return value
}
