/**
 * Shrink a photograph before uploading it.
 *
 * A phone camera produces 3-12 MB per shot, which is slow to send over a
 * mill's mobile connection and larger than the OCR needs — the handwriting is
 * legible well below the sensor's resolution. Downscaling on the device keeps
 * the upload small without touching the original in the gallery.
 *
 * Returns the file unchanged when it is already small or cannot be decoded,
 * so a failure here degrades to a slower upload rather than a broken one.
 */
export async function downscaleImage(
  file: File,
  maxEdge = 1600,
  quality = 0.85,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file

  try {
    const bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= maxEdge) {
      bitmap.close()
      return file
    }

    const scale = maxEdge / longest
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)

    const context = canvas.getContext("2d")
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    )
    if (!blob) return file

    // Keep the original if compression somehow made it bigger, which happens
    // with an already-optimised source.
    if (blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    })
  } catch {
    return file
  }
}
