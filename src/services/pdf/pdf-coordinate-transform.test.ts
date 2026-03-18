import { describe, expect, it } from 'vitest'

import {
  convertNormalizedBoxToPdfBox,
  convertNormalizedBoxToPdfBoxInRegion,
  convertNormalizedQuadrilateralToPdfQuadrilateral,
  convertNormalizedQuadrilateralToPdfQuadrilateralInRegion
} from '@/services/pdf/searchable-pdf'

describe('convertNormalizedBoxToPdfBox', () => {
  it('maps normalized bottom-left coordinates into PDF page space', () => {
    expect(
      convertNormalizedBoxToPdfBox(
        {
          x: 0.1,
          y: 0.25,
          width: 0.4,
          height: 0.1
        },
        600,
        800
      )
    ).toEqual({
      x: 60,
      y: 200,
      width: 240,
      height: 80
    })
  })
})

describe('convertNormalizedQuadrilateralToPdfQuadrilateral', () => {
  it('maps normalized quadrilateral points into PDF page space', () => {
    expect(
      convertNormalizedQuadrilateralToPdfQuadrilateral(
        {
          topLeft: { x: 0.1, y: 0.35 },
          topRight: { x: 0.5, y: 0.36 },
          bottomLeft: { x: 0.09, y: 0.25 },
          bottomRight: { x: 0.49, y: 0.26 }
        },
        600,
        800
      )
    ).toEqual({
      topLeft: { x: 60, y: 280 },
      topRight: { x: 300, y: 288 },
      bottomLeft: { x: 54, y: 200 },
      bottomRight: { x: 294, y: 208 }
    })
  })
})

describe('CropBox-aware PDF coordinate transforms', () => {
  it('maps OCR boxes into an offset crop box region', () => {
    expect(
      convertNormalizedBoxToPdfBoxInRegion(
        {
          x: 0.1,
          y: 0.25,
          width: 0.4,
          height: 0.1
        },
        {
          x: 36,
          y: 42,
          width: 500,
          height: 700
        }
      )
    ).toEqual({
      x: 86,
      y: 217,
      width: 200,
      height: 70
    })
  })

  it('maps OCR quadrilaterals into an offset crop box region', () => {
    expect(
      convertNormalizedQuadrilateralToPdfQuadrilateralInRegion(
        {
          topLeft: { x: 0.1, y: 0.35 },
          topRight: { x: 0.5, y: 0.36 },
          bottomLeft: { x: 0.09, y: 0.25 },
          bottomRight: { x: 0.49, y: 0.26 }
        },
        {
          x: 36,
          y: 42,
          width: 500,
          height: 700
        }
      )
    ).toEqual({
      topLeft: { x: 86, y: 287 },
      topRight: { x: 286, y: 294 },
      bottomLeft: { x: 81, y: 217 },
      bottomRight: { x: 281, y: 224 }
    })
  })
})
