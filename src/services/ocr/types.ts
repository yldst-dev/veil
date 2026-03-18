export interface NormalizedBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface NormalizedPoint {
  x: number
  y: number
}

export interface NormalizedQuadrilateral {
  topLeft: NormalizedPoint
  topRight: NormalizedPoint
  bottomLeft: NormalizedPoint
  bottomRight: NormalizedPoint
}

export interface OcrTextObservation {
  text: string
  confidence: number
  boundingBox: NormalizedBoundingBox
  quadrilateral?: NormalizedQuadrilateral
}

export interface OcrPageResult {
  pageIndex: number
  text: string
  observations: OcrTextObservation[]
}

export interface RecognizePageInput {
  imageBuffer: Buffer
  pageIndex: number
  recognitionLanguages: string[]
  minimumConfidence: number
}

export interface OCRProvider {
  readonly id: string
  recognizePage(input: RecognizePageInput): Promise<OcrPageResult>
  getSupportedRecognitionLanguages?(): Promise<string[]>
}
