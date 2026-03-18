import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/hooks/use-i18n'
import type { QueueItemStatus } from '@/shared/app-state'

const statusClassMap: Record<QueueItemStatus, string> = {
  idle: 'border-zinc-300/60 bg-white/70 text-zinc-700',
  queued: 'border-amber-300/60 bg-amber-100/80 text-amber-900',
  processing: 'border-sky-300/60 bg-sky-100/80 text-sky-900',
  completed: 'border-emerald-300/60 bg-emerald-100/80 text-emerald-900',
  failed: 'border-rose-300/60 bg-rose-100/80 text-rose-900',
  cancelled: 'border-zinc-300/60 bg-zinc-200/70 text-zinc-700'
}

interface StatusBadgeProps {
  status: QueueItemStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n()

  return (
    <Badge
      variant="outline"
      className={statusClassMap[status]}
    >
      {t(`status.${status}`)}
    </Badge>
  )
}
