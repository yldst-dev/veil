import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState
} from 'react'

import {
  appStateSchema,
  defaultRecognitionLanguages,
  defaultProcessingTuningValues,
  type AppState
} from '@/shared/app-state'
import { detectUiLocale, type UiLocale } from '@/shared/i18n'
import { queueActionResultSchema } from '@/shared/ipc'

function createEmptyState(): AppState {
  return appStateSchema.parse({
    items: [],
    settings: {
      outputDirectory: null,
      recognitionLanguages: [...defaultRecognitionLanguages],
      supportedRecognitionLanguages: [...defaultRecognitionLanguages],
      locale: detectUiLocale(
        typeof navigator === 'undefined' ? undefined : navigator.language
      ),
      processing: {
        detectedParallelism: 1,
        limits: { ...defaultProcessingTuningValues },
        defaults: { ...defaultProcessingTuningValues },
        values: { ...defaultProcessingTuningValues }
      }
    },
    isProcessing: false,
    activeJobId: null
  })
}

function toUserMessage(error: unknown, locale: UiLocale): string {
  if (error instanceof Error) {
    return error.message
  }

  return locale === 'ko'
    ? '데스크톱 작업 중 오류가 발생했습니다.'
    : locale === 'ja'
      ? 'デスクトップ処理で予期しないエラーが発生しました。'
      : locale === 'zh-CN'
        ? '桌面操作发生意外错误。'
        : 'Unexpected desktop action failure.'
}

export function useVeilDesktop() {
  const [state, setState] = useState<AppState>(createEmptyState)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)
  const [isAddingFiles, setIsAddingFiles] = useState(false)
  const locale = state.settings.locale

  const applyState = useEffectEvent((nextState: AppState) => {
    startTransition(() => {
      setState(nextState)
    })
  })

  useEffect(() => {
    if (!window.veilApp) {
      return
    }

    void window.veilApp
      .getState()
      .then(applyState)
      .catch(error => setErrorMessage(toUserMessage(error, locale)))

    return window.veilApp.subscribeToStateChanged(event => {
      applyState(event.state)
    })
  }, [applyState])

  async function runAction<T>(action: () => Promise<T>): Promise<T | null> {
    if (!window.veilApp) {
      setErrorMessage(
        locale === 'ko'
          ? '데스크톱 API를 사용할 수 없습니다.'
          : locale === 'ja'
            ? 'デスクトップAPIを利用できません。'
            : locale === 'zh-CN'
              ? '桌面 API 不可用。'
              : 'Desktop API is unavailable.'
      )
      return null
    }

    setIsActing(true)
    setErrorMessage(null)

    try {
      const result = await action()
      const queueResult = queueActionResultSchema.safeParse(result)

      if (queueResult.success) {
        applyState(queueResult.data.state)
      }

      return result
    } catch (error) {
      setErrorMessage(toUserMessage(error, locale))
      return null
    } finally {
      setIsActing(false)
    }
  }

  return {
    state,
    errorMessage,
    isActing,
    isAddingFiles,
    clearError: () => setErrorMessage(null),
    async choosePdfFiles() {
      setIsAddingFiles(true)

      try {
      const filePaths = await runAction(() => window.veilApp.pickPdfFiles())

        if (!filePaths || filePaths.length === 0) {
          return
        }

        await runAction(() =>
          window.veilApp.enqueueFiles({
            filePaths
          })
        )
      } finally {
        setIsAddingFiles(false)
      }
    },
    async enqueueDroppedFiles(filePaths: string[]) {
      if (filePaths.length === 0) {
        return
      }

      setIsAddingFiles(true)

      try {
        await runAction(() =>
          window.veilApp.enqueueFiles({
            filePaths
          })
        )
      } finally {
        setIsAddingFiles(false)
      }
    },
    async chooseOutputDirectory() {
      await runAction(() => window.veilApp.pickOutputDirectory())
      const nextState = await runAction(() => window.veilApp.getState())

      if (nextState) {
        applyState(nextState)
      }
    },
    async setLocale(locale: UiLocale) {
      const nextState = await runAction(() =>
        window.veilApp.setLocale({
          locale
        })
      )

      if (nextState) {
        applyState(nextState)
      }
    },
    async setProcessingSettings(input: {
      maxConcurrentJobs?: number
      maxConcurrentPagesPerJob?: number
      rasterScale?: number
      minimumConfidence?: number
    }) {
      const nextState = await runAction(() =>
        window.veilApp.setProcessingSettings(input)
      )

      if (nextState) {
        applyState(nextState)
      }
    },
    async startProcessing() {
      if (!state.settings.outputDirectory) {
        setErrorMessage(
          locale === 'ko'
            ? '시작 전에 출력 폴더를 선택하세요.'
            : locale === 'ja'
              ? '開始前に出力フォルダを選択してください。'
              : locale === 'zh-CN'
                ? '开始前请选择输出文件夹。'
                : 'Select an output folder before starting OCR.'
        )
        return
      }

      await runAction(() =>
        window.veilApp.startProcessing({
          outputDirectory: state.settings.outputDirectory,
          recognitionLanguages: state.settings.recognitionLanguages
        })
      )
    },
    async cancelJob(jobId: string) {
      await runAction(() =>
        window.veilApp.cancelJob({
          jobId
        })
      )
    },
    async removeJob(jobId: string) {
      await runAction(() =>
        window.veilApp.removeJob({
          jobId
        })
      )
    },
    async openOutputTarget(path: string) {
      await runAction(() =>
        window.veilApp.openOutputTarget({
          path
        })
      )
    }
  }
}
