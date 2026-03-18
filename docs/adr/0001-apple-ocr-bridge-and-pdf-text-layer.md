# ADR 0001: Apple OCR Bridge And Searchable PDF Strategy

## Status

Accepted

## Date

2026-03-17

## Context

The application must:

- run fully offline on macOS
- use Electron with a TypeScript-first architecture
- convert image-only PDFs into searchable PDFs
- preserve the original visible page appearance
- produce output that is searchable, selectable, and copyable in macOS Preview
- support Korean, English, Japanese, and mixed-language documents where Apple's OCR stack supports them

The OCR layer must be swappable behind an abstraction such as `OCRProvider`.

## Options Reviewed

### 1. OCRmyPDF AppleOCR plugin

Source:

- [OCRmyPDF-AppleOCR](https://github.com/mkyt/OCRmyPDF-AppleOCR)
- [PyPI package](https://pypi.org/project/ocrmypdf-appleocr/)

Observations:

- Uses Apple Vision and VisionKit class APIs through Python and `pyobjc`
- Produces invisible text layers via OCRmyPDF's mature PDF renderer pipeline
- Strongest option for advanced OCR rendering, including support for Live Text style APIs and vertical CJK text in newer modes
- Adds a heavy Python runtime and plugin toolchain to an Electron app
- Makes packaging and support materially more complex
- Weak fit for a TypeScript-first desktop app because the core OCR and PDF pipeline would live outside the main codebase

Conclusion:

- Strong OCR and PDF rendering quality
- Rejected as the primary integration because hidden operational complexity is too high for a production Electron app bundle

### 2. `@cherrystudio/mac-system-ocr`

Source:

- [GitHub](https://github.com/DeJeune/mac-system-ocr)
- [npm](https://www.npmjs.com/package/@cherrystudio/mac-system-ocr)

Observations:

- Native Node module over macOS Vision Framework
- Explicitly exposes text observations with normalized bounding boxes
- README calls out Electron compatibility fixes
- TypeScript definitions are available
- Fits Electron packaging better than a Python stack
- Uses source compilation for native binding, so Electron rebuild must be handled correctly
- Bounding boxes are axis-aligned rectangles, not per-character geometry or quadrilaterals

Conclusion:

- Best primary fit for Electron + TypeScript
- Chosen as the primary OCR bridge

### 3. `@napi-rs/system-ocr`

Source:

- [GitHub](https://github.com/Brooooooklyn/system-ocr)
- [npm](https://www.npmjs.com/package/@napi-rs/system-ocr)

Observations:

- Attractive cross-platform packaging story
- Simple API and prebuilt binaries
- Current public TypeScript API only returns `text` and `confidence`
- No public bounding box output in the distributed package API

Conclusion:

- Rejected because bounding boxes are mandatory for accurate searchable PDF text-layer placement

### 4. `macos-vision-ocr`

Source:

- [GitHub](https://github.com/bytefer/macos-vision-ocr)

Observations:

- Swift CLI using Apple's Vision framework
- Outputs structured JSON with positional data and quadrilateral points
- Good fallback shape for a CLI bridge
- Not packaged as a stable Node/Electron dependency
- Would require bundling or building a separate binary and managing process execution

Conclusion:

- Good fallback strategy if the Node native module proves unreliable in packaging or runtime
- Not chosen as the primary path because `@cherrystudio/mac-system-ocr` is simpler to integrate into Electron

## Decision

Use `@cherrystudio/mac-system-ocr` as the primary OCR backend behind an `OCRProvider` abstraction.

Use a TypeScript PDF pipeline that:

1. opens the original PDF
2. rasterizes each page for OCR input
3. runs Apple Vision OCR page by page
4. normalizes OCR observations into internal typed models
5. appends an invisible text layer onto the original page without altering visible page appearance
6. writes a new searchable PDF

## PDF Text-Layer Strategy

Use a hybrid of:

- `pdfjs-dist` plus a Node canvas implementation to rasterize PDF pages for OCR
- `pdf-lib` to load the original PDF and append invisible text content streams

Important implementation details:

- preserve original page imagery by reusing the original PDF pages rather than reconstructing them from raster output
- convert Apple Vision normalized coordinates into PDF page coordinates
- embed a Unicode-capable font so Korean, English, Japanese, and mixed-language text can be encoded into the PDF text layer
- append text using invisible PDF text rendering so text remains searchable and selectable in Preview while staying visually hidden

## Consequences

Positive:

- TypeScript-first architecture remains intact
- OCR is fully offline and uses Apple's on-device stack
- Bounding boxes are available for text placement
- Packaging is simpler than shipping an embedded Python runtime
- OCR backend remains replaceable through `OCRProvider`

Negative:

- Native Electron rebuild for the OCR module must be handled carefully
- Bounding boxes are line/block rectangles, so text-layer alignment will be approximate for some layouts
- Vertical text support is weaker than the Live Text oriented OCRmyPDF AppleOCR path

## Fallback Plan

If Electron packaging or runtime reliability for `@cherrystudio/mac-system-ocr` becomes unacceptable, switch the `OCRProvider` implementation to a local Swift CLI bridge based on a `macos-vision-ocr` style binary that returns structured JSON.

The PDF generation strategy remains unchanged in that fallback.
