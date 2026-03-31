import { readFile, rename, rm, writeFile } from 'node:fs/promises'

import { MacSystemOCRProvider } from '@/services/ocr/mac-system-ocr-provider'
import type { OcrPageResult } from '@/services/ocr/types'
import { createTemporaryOutputPath } from '@/services/files/path-utils'
import { PdfPageRasterizer } from '@/services/pdf/pdf-rasterizer'
import {
  buildSearchablePdf,
  type SearchablePdfSourcePageImage
} from '@/services/pdf/searchable-pdf'
import { workerStartJobMessageSchema } from '@/shared/worker'

let currentTemporaryOutputPath: string | null = null
let currentJobId: string | null = null

function sendMessage(message: unknown) {
  if (typeof process.send === 'function') {
    process.send(message)
  }
}

async function cleanupTemporaryOutput() {
  if (!currentTemporaryOutputPath) {
    return
  }

  await rm(currentTemporaryOutputPath, { force: true })
  currentTemporaryOutputPath = null
}

async function processJob(rawMessage: unknown) {
  const message = workerStartJobMessageSchema.parse(rawMessage)
  currentJobId = message.jobId
  const rasterizer = new PdfPageRasterizer(message.inputPath)
  const ocrProvider = new MacSystemOCRProvider()

  try {
    const totalPages = await rasterizer.getPageCount()

    sendMessage({
      type: 'job-started',
      jobId: message.jobId,
      totalPages,
      outputPath: message.outputPath
    })

    const ocrPages: Array<OcrPageResult | undefined> = new Array(totalPages)
    const sourcePageImages: Array<SearchablePdfSourcePageImage | undefined> | null =
      message.rebuildFromImages
      ? new Array(totalPages)
      : null
    const workerCount = Math.min(totalPages, message.pageConcurrency)
    let nextPageIndex = 0
    let completedPages = 0

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const pageIndex = nextPageIndex
          nextPageIndex += 1

          if (pageIndex >= totalPages) {
            return
          }

          const rasterizedPage = await rasterizer.rasterizePage(
            pageIndex,
            message.rasterScale
          )
          if (sourcePageImages) {
            sourcePageImages[pageIndex] = {
              pageIndex: rasterizedPage.pageIndex,
              pageWidth: rasterizedPage.pageWidth,
              pageHeight: rasterizedPage.pageHeight,
              imageBuffer: rasterizedPage.imageBuffer
            }
          }

          const ocrPage = await ocrProvider.recognizePage({
            imageBuffer: rasterizedPage.imageBuffer,
            pageIndex,
            recognitionLanguages: message.recognitionLanguages,
            minimumConfidence: message.minimumConfidence
          })

          ocrPages[pageIndex] = ocrPage
          completedPages += 1

          sendMessage({
            type: 'page-completed',
            jobId: message.jobId,
            completedPages,
            totalPages,
            currentPage: pageIndex + 1,
            message: `Processed page ${pageIndex + 1} of ${totalPages}.`
          })
        }
      })
    )

    const inputPdfBytes = new Uint8Array(await readFile(message.inputPath))
    const outputBytes = await buildSearchablePdf({
      inputPdfBytes,
      ocrPages: ocrPages.map((ocrPage, pageIndex) => {
        if (!ocrPage) {
          throw new Error(
            `Failed to OCR page ${pageIndex + 1} before writing the PDF.`
          )
        }

        return ocrPage
      }),
      fontPath: message.fontPath,
      rebuildFromImages: message.rebuildFromImages,
      sourcePageImages: sourcePageImages?.map((pageImage, pageIndex) => {
        if (!pageImage) {
          throw new Error(
            `Failed to rebuild page ${pageIndex + 1} before writing the PDF.`
          )
        }

        return pageImage
      })
    })

    currentTemporaryOutputPath = createTemporaryOutputPath(message.outputPath)
    await writeFile(currentTemporaryOutputPath, outputBytes)
    await rename(currentTemporaryOutputPath, message.outputPath)
    currentTemporaryOutputPath = null

    sendMessage({
      type: 'job-completed',
      jobId: message.jobId,
      outputPath: message.outputPath,
      totalPages
    })
  } catch (error) {
    await cleanupTemporaryOutput()

    sendMessage({
      type: 'job-failed',
      jobId: message.jobId,
      errorCode: 'processing-failed',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to process the PDF in the OCR worker.'
    })
  } finally {
    currentJobId = null
    await rasterizer.destroy().catch(() => undefined)
  }
}

function reportUnhandledWorkerFailure(error: unknown) {
  if (!currentJobId) {
    return
  }

  sendMessage({
    type: 'job-failed',
    jobId: currentJobId,
    errorCode: 'worker-crashed',
    message:
      error instanceof Error
        ? error.message
        : 'The OCR worker crashed unexpectedly.'
  })
}

process.on('message', message => {
  void processJob(message).finally(() => {
    process.exit(0)
  })
})

process.on('uncaughtException', error => {
  reportUnhandledWorkerFailure(error)
  void cleanupTemporaryOutput().finally(() => {
    process.exit(1)
  })
})

process.on('unhandledRejection', reason => {
  reportUnhandledWorkerFailure(reason)
  void cleanupTemporaryOutput().finally(() => {
    process.exit(1)
  })
})

process.on('SIGTERM', () => {
  void cleanupTemporaryOutput().finally(() => {
    process.exit(0)
  })
})
