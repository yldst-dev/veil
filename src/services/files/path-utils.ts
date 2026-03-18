import path from 'node:path'

export function createOutputFilePath(
  inputPath: string,
  outputDirectory: string
): string {
  const parsed = path.parse(inputPath)

  return path.join(outputDirectory, `${parsed.name}-searchable.pdf`)
}

export function createTemporaryOutputPath(outputPath: string): string {
  const parsed = path.parse(outputPath)
  return path.join(parsed.dir, `${parsed.name}.veil-processing${parsed.ext}`)
}
