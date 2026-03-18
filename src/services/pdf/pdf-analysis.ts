import { readFile } from 'node:fs/promises'

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

import type { PdfDetection } from '@/shared/app-state'
import { translate, type UiLocale } from '@/shared/i18n'

export interface PdfInspection {
  detection: PdfDetection
  pageCount: number
  message: string
}

function isPasswordError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'PasswordException' ||
      error.message.toLowerCase().includes('password'))
  )
}

function isMalformedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ['InvalidPDFException', 'FormatError', 'UnknownErrorException'].includes(
      error.name
    )
  )
}

function extractStringsFromTextContent(textContent: unknown): string[] {
  if (!textContent || typeof textContent !== 'object') {
    return []
  }

  const items = Reflect.get(textContent, 'items')

  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map(item => {
      if (!item || typeof item !== 'object') {
        return ''
      }

      const value = Reflect.get(item, 'str')
      return typeof value === 'string' ? value.trim() : ''
    })
    .filter(Boolean)
}

export async function inspectPdfFile(
  filePath: string,
  locale: UiLocale
): Promise<PdfInspection> {
  const data = await readFile(filePath)

  try {
    const loadingTask = getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: true
    })
    const document = await loadingTask.promise
    const pageCount = document.numPages

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const strings = extractStringsFromTextContent(textContent)

      if (strings.length > 0) {
        await document.destroy()
        return {
          detection: 'already-searchable',
          pageCount,
          message: translate(locale, 'pdf.alreadySearchable')
        }
      }
    }

    await document.destroy()

    return {
      detection: 'image-only',
      pageCount,
      message: translate(locale, 'pdf.imageOnlyReady')
    }
  } catch (error) {
    if (isPasswordError(error)) {
      return {
        detection: 'encrypted',
        pageCount: 0,
        message: translate(locale, 'pdf.encrypted')
      }
    }

    if (isMalformedError(error)) {
      return {
        detection: 'malformed',
        pageCount: 0,
        message: translate(locale, 'pdf.malformed')
      }
    }

    throw error
  }
}
