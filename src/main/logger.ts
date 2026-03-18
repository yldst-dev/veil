import log from 'electron-log/main'

log.initialize()
log.transports.file.level = 'info'

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    log.info(message, meta ?? {})
  },
  warn(message: string, meta?: Record<string, unknown>) {
    log.warn(message, meta ?? {})
  },
  error(message: string, meta?: Record<string, unknown>) {
    log.error(message, meta ?? {})
  }
}
