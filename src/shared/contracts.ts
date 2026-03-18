import { z } from 'zod'

import type { VeilDesktopApi } from '@/shared/ipc'

export const appEnvironmentSchema = z.object({
  platform: z.string()
})

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>

export interface VeilEnvironmentApi extends AppEnvironment {
  getPathForDroppedFile: (file: File) => string
}

declare global {
  interface Window {
    veil: VeilEnvironmentApi
    veilApp: VeilDesktopApi
  }
}
