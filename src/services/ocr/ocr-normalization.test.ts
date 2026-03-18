import observationsFixture from '../../../test/fixtures/mac-ocr-observations.json'

import { normalizeMacSystemObservation } from '@/services/ocr/ocr-normalization'

import { describe, expect, it } from 'vitest'

describe('normalizeMacSystemObservation', () => {
  it('keeps meaningful observations and trims text', () => {
    const normalized = normalizeMacSystemObservation(observationsFixture[0], 0.3)

    expect(normalized).toEqual({
      text: 'Hello OCR',
      confidence: 0.94,
      boundingBox: {
        x: 0.1,
        y: 0.8,
        width: 0.2,
        height: 0.05
      },
      quadrilateral: undefined
    })
  })

  it('drops empty and low-confidence observations', () => {
    expect(normalizeMacSystemObservation(observationsFixture[1], 0.3)).toBeNull()
    expect(normalizeMacSystemObservation(observationsFixture[2], 0.3)).toBeNull()
  })

  it('keeps quadrilateral geometry when available', () => {
    expect(
      normalizeMacSystemObservation(
        {
          text: 'Tilted',
          confidence: 0.91,
          x: 0.2,
          y: 0.4,
          width: 0.3,
          height: 0.08,
          quadrilateral: {
            topLeft: { x: 0.21, y: 0.49 },
            topRight: { x: 0.5, y: 0.5 },
            bottomLeft: { x: 0.2, y: 0.4 },
            bottomRight: { x: 0.49, y: 0.41 }
          }
        },
        0.3
      )
    ).toEqual({
      text: 'Tilted',
      confidence: 0.91,
      boundingBox: {
        x: 0.2,
        y: 0.4,
        width: 0.3,
        height: 0.08
      },
      quadrilateral: {
        topLeft: { x: 0.21, y: 0.49 },
        topRight: { x: 0.5, y: 0.5 },
        bottomLeft: { x: 0.2, y: 0.4 },
        bottomRight: { x: 0.49, y: 0.41 }
      }
    })
  })
})
