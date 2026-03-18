import { readFile } from 'node:fs/promises'

import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'
import { type Canvas, createCanvas } from '@napi-rs/canvas/node-canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const nodeGlobals = globalThis as unknown as Record<string, unknown>

nodeGlobals.DOMMatrix ??= DOMMatrix
nodeGlobals.ImageData ??= ImageData
nodeGlobals.Path2D ??= Path2D

interface CanvasAndContext {
  canvas: Canvas
  context: ReturnType<Canvas['getContext']>
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')

    return { canvas, context }
  }

  destroy(canvasAndContext: CanvasAndContext) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
  }
}

export interface RasterizedPdfPage {
  pageIndex: number
  pageWidth: number
  pageHeight: number
  imageWidth: number
  imageHeight: number
  imageBuffer: Buffer
}

export class PdfPageRasterizer {
  private readonly bytesPromise: Promise<Uint8Array>
  private readonly documentPromise: Promise<Awaited<ReturnType<typeof getDocument>>['promise'] extends Promise<infer T> ? T : never>

  constructor(private readonly filePath: string) {
    this.bytesPromise = readFile(filePath).then(data => new Uint8Array(data))
    this.documentPromise = this.loadDocument()
  }

  async getPageCount(): Promise<number> {
    const document = await this.documentPromise
    return document.numPages
  }

  async rasterizePage(
    pageIndex: number,
    scale = 2
  ): Promise<RasterizedPdfPage> {
    const document = await this.documentPromise
    const page = await document.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale })
    const canvasFactory = new NodeCanvasFactory()
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height)

    await page.render({
      canvasContext: canvasAndContext.context as never,
      canvas: canvasAndContext.canvas as never,
      viewport
    }).promise

    const imageBuffer = canvasAndContext.canvas.toBuffer('image/png')
    const baseViewport = page.getViewport({ scale: 1 })

    canvasFactory.destroy(canvasAndContext)

    return {
      pageIndex,
      pageWidth: baseViewport.width,
      pageHeight: baseViewport.height,
      imageWidth: viewport.width,
      imageHeight: viewport.height,
      imageBuffer
    }
  }

  async destroy() {
    const document = await this.documentPromise
    await document.destroy()
  }

  private async loadDocument() {
    const bytes = await this.bytesPromise
    const task = getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: true
    })

    return task.promise
  }
}
