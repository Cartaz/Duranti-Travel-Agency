export type AppReadinessNoticeKind = 'info' | 'warning'

export interface AppReadinessNotice {
  id: string
  kind: AppReadinessNoticeKind
  title: string
  message: string
  backupAction?: boolean
}
