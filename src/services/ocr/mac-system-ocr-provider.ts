import { normalizeMacSystemObservation } from '@/services/ocr/ocr-normalization'
import type {
  OCRProvider,
  OcrPageResult,
  OcrTextObservation,
  RecognizePageInput
} from '@/services/ocr/types'

interface MacOCRResult {
  text: string
  observations: Array<{
    text: string
    confidence: number
    x: number
    y: number
    width: number
    height: number
    quadrilateral?: {
      topLeft: { x: number; y: number }
      topRight: { x: number; y: number }
      bottomLeft: { x: number; y: number }
      bottomRight: { x: number; y: number }
    }
  }>
}

interface MacOCRModule {
  RECOGNITION_LEVEL_ACCURATE: number
  getSupportedRecognitionLanguages(options?: {
    recognitionLevel?: number
  }): Promise<string[]> | string[]
  recognizeFromBuffer(
    imageBuffer: Buffer | Uint8Array,
    options: {
      languages: string
      recognitionLevel: number
      minConfidence: number
    }
  ): Promise<MacOCRResult>
}

let macOCRModulePromise: Promise<MacOCRModule> | null = null

async function loadMacOCRModule(): Promise<MacOCRModule> {
  macOCRModulePromise ??= import('@cherrystudio/mac-system-ocr').then(module => {
    const candidate = 'default' in module ? module.default : module

    if (
      !candidate ||
      (typeof candidate !== 'object' && typeof candidate !== 'function') ||
      typeof candidate.recognizeFromBuffer !== 'function'
    ) {
      throw new Error('Failed to load the Apple OCR module.')
    }

    return candidate as MacOCRModule
  })

  return macOCRModulePromise
}

export class MacSystemOCRProvider implements OCRProvider {
  readonly id = 'mac-system-ocr'

  async getSupportedRecognitionLanguages(): Promise<string[]> {
    const macOCR = await loadMacOCRModule()
    const supportedLocales = await Promise.resolve(
      macOCR.getSupportedRecognitionLanguages({
        recognitionLevel: macOCR.RECOGNITION_LEVEL_ACCURATE
      })
    )

    return Array.from(new Set(supportedLocales)).sort((left, right) =>
      left.localeCompare(right)
    )
  }

  async recognizePage(input: RecognizePageInput): Promise<OcrPageResult> {
    const macOCR = await loadMacOCRModule()
    const result = await macOCR.recognizeFromBuffer(input.imageBuffer, {
      languages: input.recognitionLanguages.join(', '),
      recognitionLevel: macOCR.RECOGNITION_LEVEL_ACCURATE,
      minConfidence: input.minimumConfidence
    })

    const observations = result.observations
      .map(observation =>
        normalizeMacSystemObservation(observation, input.minimumConfidence)
      )
      .filter((observation): observation is OcrTextObservation =>
        observation !== null
      )

    return {
      pageIndex: input.pageIndex,
      text: result.text,
      observations
    }
  }
}
