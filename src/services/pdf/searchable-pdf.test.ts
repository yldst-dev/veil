import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'

import { PdfPageRasterizer } from '@/services/pdf/pdf-rasterizer'
import {
  buildSearchablePdf,
  createInvisibleTextPlacement
} from '@/services/pdf/searchable-pdf'

describe('buildSearchablePdf', () => {
  it('injects extractable text while preserving the original page count', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([600, 800])

    const outputBytes = await buildSearchablePdf({
      inputPdfBytes: await pdf.save({ useObjectStreams: false }),
      fontPath: path.join(
        process.cwd(),
        'resources',
        'fonts',
        'NotoSansCJKkr-Regular.otf'
      ),
      ocrPages: [
        {
          pageIndex: 0,
          text: 'Hello OCR',
          observations: [
            {
              text: 'Hello OCR',
              confidence: 0.98,
              boundingBox: {
                x: 0.1,
                y: 0.6,
                width: 0.28,
                height: 0.05
              }
            }
          ]
        }
      ]
    })

    const pdfJsDocument = await getDocument({
      data: outputBytes,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise
    const page = await pdfJsDocument.getPage(1)
    const textContent = await page.getTextContent()
    const extracted = textContent.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')

    expect(pdfJsDocument.numPages).toBe(1)
    expect(extracted).toContain('Hello OCR')

    await pdfJsDocument.destroy()
  })

  it('rebuilds already searchable PDFs from page images so stale text is removed', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([600, 800])
    page.drawText('Old Text Layer', {
      x: 72,
      y: 620,
      size: 28,
      font
    })

    const inputPdfBytes = await pdf.save({ useObjectStreams: false })
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'veil-searchable-pdf-')
    )
    const inputPath = path.join(temporaryDirectory, 'already-searchable.pdf')
    await writeFile(inputPath, inputPdfBytes)

    const rasterizer = new PdfPageRasterizer(inputPath)

    try {
      const rasterizedPage = await rasterizer.rasterizePage(0, 2)
      const outputBytes = await buildSearchablePdf({
        inputPdfBytes,
        fontPath: path.join(
          process.cwd(),
          'resources',
          'fonts',
          'NotoSansCJKkr-Regular.otf'
        ),
        rebuildFromImages: true,
        sourcePageImages: [
          {
            pageIndex: rasterizedPage.pageIndex,
            pageWidth: rasterizedPage.pageWidth,
            pageHeight: rasterizedPage.pageHeight,
            imageBuffer: rasterizedPage.imageBuffer
          }
        ],
        ocrPages: [
          {
            pageIndex: 0,
            text: 'New OCR Layer',
            observations: [
              {
                text: 'New OCR Layer',
                confidence: 0.98,
                boundingBox: {
                  x: 0.12,
                  y: 0.74,
                  width: 0.34,
                  height: 0.05
                }
              }
            ]
          }
        ]
      })

      const pdfJsDocument = await getDocument({
        data: outputBytes,
        isEvalSupported: false,
        useSystemFonts: true
      }).promise
      const rebuiltPage = await pdfJsDocument.getPage(1)
      const textContent = await rebuiltPage.getTextContent()
      const extracted = textContent.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')

      expect(extracted).toContain('New OCR Layer')
      expect(extracted).not.toContain('Old Text Layer')

      await pdfJsDocument.destroy()
    } finally {
      await rasterizer.destroy().catch(() => undefined)
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  it('stabilizes placement by using rotation without preserving OCR shear', () => {
    const font = {
      sizeAtHeight: (height: number) => height,
      widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
      heightAtSize: (size: number) => size
    }

    const placement = createInvisibleTextPlacement(
      font,
      '머리말',
      {
        x: 68,
        y: 740,
        width: 55,
        height: 8
      },
      {
        topLeft: { x: 69, y: 754 },
        topRight: { x: 123, y: 753.7 },
        bottomLeft: { x: 68, y: 747.2 },
        bottomRight: { x: 122, y: 746.9 }
      }
    )

    expect(placement).not.toBeNull()
    expect(placement?.y).toBeGreaterThanOrEqual(740)
    expect(placement?.y).toBeLessThanOrEqual(748)
    expect(Math.abs(placement?.c ?? 0)).toBeLessThan(0.02)
    expect(Math.abs((placement?.d ?? 0) - 1)).toBeLessThan(0.02)
  })

  it('falls back to axis-aligned placement when rotated geometry escapes the OCR box', () => {
    const font = {
      sizeAtHeight: (height: number) => height,
      widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
      heightAtSize: (size: number) => size
    }

    const placement = createInvisibleTextPlacement(
      font,
      'Header',
      {
        x: 68,
        y: 740,
        width: 55,
        height: 8
      },
      {
        topLeft: { x: 67, y: 760 },
        topRight: { x: 123, y: 750 },
        bottomLeft: { x: 68, y: 747.2 },
        bottomRight: { x: 122, y: 746.9 }
      }
    )

    expect(placement).not.toBeNull()
    expect(placement?.b).toBe(0)
    expect(placement?.c).toBe(0)
    expect(placement?.y).toBeLessThanOrEqual(748)
  })
})
