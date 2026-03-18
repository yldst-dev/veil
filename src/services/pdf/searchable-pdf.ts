import { readFile } from 'node:fs/promises'

import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode
} from 'pdf-lib'

import type {
  NormalizedBoundingBox,
  NormalizedPoint,
  NormalizedQuadrilateral,
  OcrPageResult
} from '@/services/ocr/types'

export interface PagePdfBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PagePdfBoxRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface PagePdfPoint {
  x: number
  y: number
}

export interface PagePdfQuadrilateral {
  topLeft: PagePdfPoint
  topRight: PagePdfPoint
  bottomLeft: PagePdfPoint
  bottomRight: PagePdfPoint
}

export interface TextPlacementMatrix {
  a: number
  b: number
  c: number
  d: number
  x: number
  y: number
  fontSize: number
}

export interface SearchablePdfBuildInput {
  inputPdfBytes: Uint8Array
  ocrPages: OcrPageResult[]
  fontPath: string
}

function sanitizePdfText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function convertNormalizedPointToPdfPoint(
  point: NormalizedPoint,
  pageWidth: number,
  pageHeight: number
): PagePdfPoint {
  return {
    x: point.x * pageWidth,
    y: point.y * pageHeight
  }
}

export function convertNormalizedBoxToPdfBox(
  box: NormalizedBoundingBox,
  pageWidth: number,
  pageHeight: number
): PagePdfBoundingBox {
  return convertNormalizedBoxToPdfBoxInRegion(box, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight
  })
}

export function convertNormalizedBoxToPdfBoxInRegion(
  box: NormalizedBoundingBox,
  pageRegion: PagePdfBoxRegion
): PagePdfBoundingBox {
  return {
    x: pageRegion.x + box.x * pageRegion.width,
    y: pageRegion.y + box.y * pageRegion.height,
    width: box.width * pageRegion.width,
    height: box.height * pageRegion.height
  }
}

export function convertNormalizedQuadrilateralToPdfQuadrilateral(
  quadrilateral: NormalizedQuadrilateral,
  pageWidth: number,
  pageHeight: number
): PagePdfQuadrilateral {
  return convertNormalizedQuadrilateralToPdfQuadrilateralInRegion(quadrilateral, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight
  })
}

export function convertNormalizedQuadrilateralToPdfQuadrilateralInRegion(
  quadrilateral: NormalizedQuadrilateral,
  pageRegion: PagePdfBoxRegion
): PagePdfQuadrilateral {
  return {
    topLeft: {
      x: pageRegion.x + quadrilateral.topLeft.x * pageRegion.width,
      y: pageRegion.y + quadrilateral.topLeft.y * pageRegion.height
    },
    topRight: {
      x: pageRegion.x + quadrilateral.topRight.x * pageRegion.width,
      y: pageRegion.y + quadrilateral.topRight.y * pageRegion.height
    },
    bottomLeft: {
      x: pageRegion.x + quadrilateral.bottomLeft.x * pageRegion.width,
      y: pageRegion.y + quadrilateral.bottomLeft.y * pageRegion.height
    },
    bottomRight: {
      x: pageRegion.x + quadrilateral.bottomRight.x * pageRegion.width,
      y: pageRegion.y + quadrilateral.bottomRight.y * pageRegion.height
    }
  }
}

function vectorLength(from: PagePdfPoint, to: PagePdfPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

function normalizeVector(from: PagePdfPoint, to: PagePdfPoint): PagePdfPoint | null {
  const length = vectorLength(from, to)

  if (length <= 0) {
    return null
  }

  return {
    x: (to.x - from.x) / length,
    y: (to.y - from.y) / length
  }
}

function offsetPoint(
  point: PagePdfPoint,
  unitVector: PagePdfPoint,
  distance: number
): PagePdfPoint {
  return {
    x: point.x + unitVector.x * distance,
    y: point.y + unitVector.y * distance
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function createAxisAlignedPlacement(
  box: PagePdfBoundingBox,
  textWidth: number,
  fullTextHeight: number,
  fontSize: number,
  pageRegion?: PagePdfBoxRegion
): TextPlacementMatrix {
  const rawY = box.y + Math.max(0, (box.height - fullTextHeight) / 2)
  return {
    a: box.width / textWidth,
    b: 0,
    c: 0,
    d: 1,
    x:
      pageRegion !== undefined
        ? clamp(
            box.x,
            pageRegion.x,
            Math.max(pageRegion.x, pageRegion.x + pageRegion.width - box.width)
          )
        : box.x,
    y:
      pageRegion !== undefined
        ? clamp(
            rawY,
            pageRegion.y,
            Math.max(
              pageRegion.y,
              pageRegion.y + pageRegion.height - fullTextHeight
            )
          )
        : rawY,
    fontSize
  }
}

function estimatePlacementBounds(
  placement: TextPlacementMatrix,
  textWidth: number,
  fullTextHeight: number
) {
  const origin = { x: placement.x, y: placement.y }
  const xVector = {
    x: placement.a * textWidth,
    y: placement.b * textWidth
  }
  const yVector = {
    x: placement.c * fullTextHeight,
    y: placement.d * fullTextHeight
  }
  const points = [
    origin,
    {
      x: origin.x + xVector.x,
      y: origin.y + xVector.y
    },
    {
      x: origin.x + yVector.x,
      y: origin.y + yVector.y
    },
    {
      x: origin.x + xVector.x + yVector.x,
      y: origin.y + xVector.y + yVector.y
    }
  ]

  return {
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y))
  }
}

function placementEscapesBox(
  placement: TextPlacementMatrix,
  box: PagePdfBoundingBox,
  textWidth: number,
  fullTextHeight: number
): boolean {
  const bounds = estimatePlacementBounds(placement, textWidth, fullTextHeight)
  const toleranceX = Math.max(6, box.width * 0.08)
  const toleranceY = Math.max(4, box.height * 0.15)

  return (
    bounds.minX < box.x - toleranceX ||
    bounds.maxX > box.x + box.width + toleranceX ||
    bounds.minY < box.y - toleranceY ||
    bounds.maxY > box.y + box.height + toleranceY
  )
}

export function createInvisibleTextPlacement(
  font: Pick<PDFFont, 'sizeAtHeight' | 'widthOfTextAtSize' | 'heightAtSize'>,
  text: string,
  box: PagePdfBoundingBox,
  quadrilateral?: PagePdfQuadrilateral,
  pageRegion?: PagePdfBoxRegion
): TextPlacementMatrix | null {
  const normalizedText = sanitizePdfText(text)

  if (!normalizedText || box.width <= 0 || box.height <= 0) {
    return null
  }

  const heightSource = quadrilateral
    ? Math.max(
        0,
        vectorLength(quadrilateral.bottomLeft, quadrilateral.topLeft),
        vectorLength(quadrilateral.bottomRight, quadrilateral.topRight)
      )
    : box.height
  const targetHeight = Math.max(
    4,
    Math.min(box.height, heightSource || box.height) * 0.82
  )
  const fontSize = Math.max(4, font.sizeAtHeight(targetHeight))
  const textWidth = font.widthOfTextAtSize(normalizedText, fontSize)

  if (textWidth <= 0) {
    return null
  }

  const fullTextHeight = font.heightAtSize(fontSize, { descender: true })
  const axisAlignedPlacement = createAxisAlignedPlacement(
    box,
    textWidth,
    fullTextHeight,
    fontSize,
    pageRegion
  )

  if (quadrilateral) {
    const xUnit = normalizeVector(
      quadrilateral.bottomLeft,
      quadrilateral.bottomRight
    )
    const quadWidth = vectorLength(
      quadrilateral.bottomLeft,
      quadrilateral.bottomRight
    )
    const quadHeight = Math.max(
      vectorLength(quadrilateral.bottomLeft, quadrilateral.topLeft),
      vectorLength(quadrilateral.bottomRight, quadrilateral.topRight)
    )

    if (xUnit && quadWidth > 0 && quadHeight > 0) {
      // Keep rotation from the baseline, but rebuild the Y axis as a strict
      // orthogonal vector so accumulated OCR skew does not shear text upward.
      const yUnit = {
        x: -xUnit.y,
        y: xUnit.x
      }
      const horizontalScale = Math.min(box.width, quadWidth) / textWidth
      const verticalCentering = Math.max(
        0,
        (Math.min(box.height, quadHeight) - fullTextHeight) / 2
      )
      const origin = offsetPoint(
        {
          x: clamp(quadrilateral.bottomLeft.x, box.x, box.x + box.width),
          y: clamp(quadrilateral.bottomLeft.y, box.y, box.y + box.height)
        },
        yUnit,
        verticalCentering
      )

      const rotatedPlacement = {
        a: xUnit.x * horizontalScale,
        b: xUnit.y * horizontalScale,
        c: yUnit.x,
        d: yUnit.y,
        x:
          pageRegion !== undefined
            ? clamp(
                origin.x,
                pageRegion.x,
                Math.max(
                  pageRegion.x,
                  pageRegion.x + pageRegion.width - box.width
                )
              )
            : origin.x,
        y:
          pageRegion !== undefined
            ? clamp(
                origin.y,
                pageRegion.y,
                Math.max(
                  pageRegion.y,
                  pageRegion.y + pageRegion.height - fullTextHeight
                )
              )
            : clamp(origin.y, box.y, box.y + box.height),
        fontSize
      }

      if (!placementEscapesBox(rotatedPlacement, box, textWidth, fullTextHeight)) {
        return rotatedPlacement
      }
    }
  }

  return axisAlignedPlacement
}

function buildInvisibleObservationTextOperators(
  page: PDFPage,
  font: PDFFont,
  text: string,
  box: PagePdfBoundingBox,
  quadrilateral?: PagePdfQuadrilateral,
  pageRegion?: PagePdfBoxRegion
){
  const placement = createInvisibleTextPlacement(
    font,
    text,
    box,
    quadrilateral,
    pageRegion
  )

  if (!placement) {
    return []
  }

  const pageInternals = page as unknown as {
    setOrEmbedFont: (font: PDFFont) => { newFontKey: string }
  }
  const { newFontKey } = pageInternals.setOrEmbedFont(font)

  return [
    pushGraphicsState(),
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    setFontAndSize(newFontKey, placement.fontSize),
    setTextMatrix(
      placement.a,
      placement.b,
      placement.c,
      placement.d,
      placement.x,
      placement.y
    ),
    showText(font.encodeText(sanitizePdfText(text))),
    endText(),
    popGraphicsState()
  ]
}

function prependOperatorsToPage(
  page: PDFPage,
  operators: ReturnType<typeof buildInvisibleObservationTextOperators>
) {
  if (operators.length === 0) {
    return
  }

  const pageInternals = page as unknown as {
    createContentStream: (...operators: ReturnType<typeof buildInvisibleObservationTextOperators>) => unknown
    doc: {
      context: {
        register: (stream: unknown) => unknown
      }
    }
    node: {
      wrapContentStreams: (startRef: unknown, endRef: unknown) => boolean
      addContentStream?: (streamRef: unknown) => void
    }
  }

  const startStream = pageInternals.createContentStream(...operators)
  const endStream = pageInternals.createContentStream()
  const startRef = pageInternals.doc.context.register(startStream)
  const endRef = pageInternals.doc.context.register(endStream)

  if (!pageInternals.node.wrapContentStreams(startRef, endRef)) {
    page.pushOperators(...operators)
  }
}

export function appendInvisibleTextLayerToPage(
  page: PDFPage,
  font: PDFFont,
  ocrPage: OcrPageResult
) {
  const cropBox = page.getCropBox()
  const pageRegion = {
    x: cropBox.x,
    y: cropBox.y,
    width: cropBox.width,
    height: cropBox.height
  }
  const operators = []

  for (const observation of ocrPage.observations) {
    const pdfBox = convertNormalizedBoxToPdfBoxInRegion(
      observation.boundingBox,
      pageRegion
    )
    const pdfQuadrilateral = observation.quadrilateral
      ? convertNormalizedQuadrilateralToPdfQuadrilateralInRegion(
          observation.quadrilateral,
          pageRegion
        )
      : undefined

    operators.push(
      ...buildInvisibleObservationTextOperators(
        page,
        font,
        observation.text,
        pdfBox,
        pdfQuadrilateral,
        pageRegion
      )
    )
  }

  prependOperatorsToPage(page, operators)
}

export async function buildSearchablePdf(
  input: SearchablePdfBuildInput
): Promise<Uint8Array> {
  const document = await PDFDocument.load(input.inputPdfBytes)
  document.registerFontkit(fontkit)

  const fontBytes = await readFile(input.fontPath)
  const font = await document.embedFont(fontBytes, {
    subset: true
  })

  const pages = document.getPages()

  for (const ocrPage of input.ocrPages) {
    const page = pages[ocrPage.pageIndex]

    if (!page) {
      continue
    }

    appendInvisibleTextLayerToPage(page, font, ocrPage)
  }

  return document.save({
    useObjectStreams: false
  })
}
