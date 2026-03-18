import {
  Cancel01Icon,
  Delete02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useI18n } from '@/hooks/use-i18n'
import { StatusBadge } from '@/components/status-badge'
import type { QueueListItem } from '@/shared/app-state'

interface QueuePreviewProps {
  items: QueueListItem[]
  onCancelJob: (jobId: string) => void
  onRemoveJob: (jobId: string) => void
  onOpenOutput: (targetPath: string) => void
}

function DetectionBadge({ item }: { item: QueueListItem }) {
  const { t } = useI18n()

  if (item.detection === 'image-only') {
    return <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700 text-[11px] px-1.5 py-0 shadow-none font-normal h-4 rounded-sm tracking-wider uppercase">{t('detection.image-only')}</Badge>
  }
  if (item.detection === 'already-searchable') {
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 text-[11px] px-1.5 py-0 shadow-none font-normal h-4 rounded-sm tracking-wider uppercase">{t('detection.already-searchable')}</Badge>
  }

  return (
    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 text-[11px] px-1.5 py-0 shadow-none font-normal h-4 rounded-sm tracking-wider uppercase">
      {t(`detection.${item.detection}` as 'detection.encrypted' | 'detection.malformed')}
    </Badge>
  )
}

export function QueuePreview({
  items,
  onCancelJob,
  onRemoveJob,
  onOpenOutput
}: QueuePreviewProps) {
  const { t } = useI18n()

  return (
    <div className="h-full w-full overflow-y-auto pb-2">
      {items.length === 0 ? (
        <div className="flex h-full min-h-[200px] items-center justify-center text-[13px] text-zinc-400">
          {t('empty.queue')}
        </div>
      ) : (
        <div className="flex flex-col">
            {items.map((item, index) => {
              const isActive = item.status === 'processing'

            return (
              <div key={item.id} className="hover:bg-zinc-50 transition-colors">
                <div className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-medium text-zinc-800">
                          {item.fileName}
                        </p>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      {item.outputPath && (
                        <p className="truncate text-[11px] text-zinc-400 mt-0.5" title={item.outputPath}>
                          {item.outputPath}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <StatusBadge status={item.status} />
                        {item.status === 'processing' && (
                          <Button
                            variant="outline"
                            size="icon-xs"
                            onClick={() => onCancelJob(item.id)}
                            aria-label={t('action.cancel')}
                            title={t('action.cancel')}
                            className="size-5 shadow-none border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 rounded-sm"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                          </Button>
                        )}
                        {item.status !== 'processing' && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onRemoveJob(item.id)}
                            aria-label={t('action.remove')}
                            title={t('action.remove')}
                            className="size-5 shadow-none text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-sm"
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                          </Button>
                        )}
                      </div>
                      {item.outputPath && item.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenOutput(item.outputPath as string)}
                          className="h-5 text-[11px] shadow-none px-2 py-0 border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 rounded-sm"
                        >
                          {t('action.open')}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <DetectionBadge item={item} />
                    {item.totalPages > 0 && (
                      <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
                        {item.completedPages}/{item.totalPages} P
                      </span>
                    )}
                  </div>

                  {isActive && (
                    <div className="mt-1.5 mb-1.5 pl-0.5">
                       <Progress value={item.progressPercent} className="h-1 shadow-none bg-zinc-100" />
                    </div>
                  )}
                </div>
                {index < items.length - 1 && <Separator className="bg-zinc-100/50" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
