# Technical Note

## Chosen Apple OCR Integration

Primary OCR bridge:

- patched `@cherrystudio/mac-system-ocr`

Why it was selected:

- exposes Vision OCR observations with bounding boxes
- can be locally patched inside the app workspace to expose token-level quadrilateral geometry from `VNRecognizedText.boundingBoxForRange`
- native Node integration fits Electron better than a Python plugin stack
- explicit Electron compatibility fixes are documented by the package
- keeps the app TypeScript-first while still using Apple's on-device OCR APIs

Why the other evaluated options were not chosen as primary:

- `OCRmyPDF AppleOCR`
  - strongest turnkey PDF rendering path
  - too much hidden complexity for an Electron app because it introduces Python, `pyobjc`, plugin orchestration, and packaging overhead
- `@napi-rs/system-ocr`
  - better packaging story on paper
  - current public API does not expose the bounding boxes needed for text-layer placement
- `macos-vision-ocr`
  - good CLI fallback shape with structured geometry
  - would require managing a separate bundled binary and process bridge

## PDF Strategy

The PDF pipeline is intentionally hybrid:

1. `pdfjs-dist` inspects input PDFs and rasterizes pages for OCR.
2. Apple OCR runs page by page on the rasterized images.
3. OCR observations are normalized into internal types.
4. `pdf-lib` reopens the original PDF and appends invisible text content to the original pages.

This avoids re-rendering visible page imagery and keeps the original scan appearance unchanged.

## Invisible Text Layer

The text layer is written with PDF text operators using invisible text rendering mode. The recognized text is positioned using normalized OCR boxes converted into PDF page space.

Implementation details:

- OCR coordinates are treated as normalized bottom-left-origin rectangles
- when available, quadrilateral token geometry is used to build a rotated/sheared PDF text matrix instead of relying only on axis-aligned boxes
- page-space conversion multiplies by the original PDF page width and height
- text is horizontally scaled to fit the OCR box width
- a bundled Unicode-capable CJK font is embedded so Korean, English, Japanese, and mixed-language text can be encoded into the PDF

## Queue And Cancellation

- the Electron main process owns queue state
- actual OCR and PDF generation run in separate worker processes
- the queue can keep multiple workers busy at once, bounded by CPU-aware concurrency settings
- each worker OCRs multiple pages in parallel, then writes a single searchable PDF at the end
- cancelling the active job kills the worker and removes the temporary output file
- queued items can be cancelled before they start

## Packaging Notes

- `electron-builder` is used for macOS packaging
- the native OCR dependency is rebuilt for Electron during install/package
- the rebuild must match the active CPU architecture; an x64 build of the OCR addon on Apple Silicon will cause the worker process to exit before OCR starts
- the OCR font resource is bundled into `Contents/Resources/fonts`
- the native OCR module is unpacked from ASAR
