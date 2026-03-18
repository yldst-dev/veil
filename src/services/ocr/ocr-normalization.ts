import type { OcrTextObservation } from '@/services/ocr/types'

export interface MacSystemOCRObservation {
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
}

export function normalizeMacSystemObservation(
  observation: MacSystemOCRObservation,
  minimumConfidence: number
): OcrTextObservation | null {
  const text = observation.text.trim()

  if (!text || observation.confidence < minimumConfidence) {
    return null
  }

  return {
    text,
    confidence: observation.confidence,
    boundingBox: {
      x: observation.x,
      y: observation.y,
      width: observation.width,
      height: observation.height
    },
    quadrilateral: observation.quadrilateral
  }
}
