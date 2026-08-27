import type { Photo } from '../types'

export interface ProcessedPhoto {
  kind: Photo['kind']
  fullBlob: Blob
  thumbnailBlob: Blob
  width: number
  height: number
  byteSize: number
  mimeType: 'image/jpeg'
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  dispose: () => void
}

const decodeImage = async (file: File): Promise<DecodedImage> => {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      }
    } catch {
      // Safari 能顯示部分 HEIC，但 createImageBitmap 不一定能解；改走 img 解碼。
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('這張照片的格式無法讀取'))
      image.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

const render = (
  decoded: DecodedImage,
  width: number,
  height: number,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('這台裝置無法處理照片')
  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
  return canvas
}

const jpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('照片壓縮失敗'))),
      'image/jpeg',
      quality,
    ),
  )

const fit = (width: number, height: number, maxWidth: number, maxHeight: number) => {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

const fitPixels = (width: number, height: number, maxPixels: number) => {
  const scale = width * height > maxPixels ? Math.sqrt(maxPixels / (width * height)) : 1
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

const makeFullImage = async (decoded: DecodedImage, kind: Photo['kind']) => {
  const receipt = kind === 'receipt'
  let initial = receipt
    ? fit(decoded.width, decoded.height, 1400, Number.POSITIVE_INFINITY)
    : fit(decoded.width, decoded.height, 2560, 2560)
  // 超長收據若只限制寬度，可能超過 iOS Canvas 的像素上限而完全無法輸出。
  if (receipt) initial = fitPixels(initial.width, initial.height, 12_000_000)
  const targetBytes = receipt ? 450 * 1024 : 1.5 * 1024 * 1024
  const hardBytes = receipt ? 750 * 1024 : 2 * 1024 * 1024
  const minQuality = receipt ? 0.6 : 0.76
  const minReceiptWidth = Math.min(initial.width, 900)
  let width = initial.width
  let height = initial.height
  let quality = receipt ? 0.7 : 0.84
  let blob = await jpeg(render(decoded, width, height), quality)

  for (let attempt = 0; blob.size > targetBytes && attempt < 12; attempt++) {
    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.04)
    } else {
      const nextWidth = receipt
        ? Math.max(minReceiptWidth, Math.round(width * 0.85))
        : Math.max(640, Math.round(width * 0.85))
      if (nextWidth === width) break
      const scale = nextWidth / width
      width = nextWidth
      height = Math.max(1, Math.round(height * scale))
      quality = receipt ? 0.68 : 0.82
    }
    blob = await jpeg(render(decoded, width, height), quality)
  }

  if (blob.size > hardBytes) {
    throw new Error(receipt ? '收據過長，壓縮後仍超過 750 KB' : '照片壓縮後仍超過 2 MB')
  }
  return { blob, width, height }
}

const makeThumbnail = async (decoded: DecodedImage): Promise<Blob> => {
  let { width, height } = fit(decoded.width, decoded.height, 480, 480)
  let quality = 0.72
  let blob = await jpeg(render(decoded, width, height), quality)
  for (let attempt = 0; blob.size > 120 * 1024 && attempt < 8; attempt++) {
    if (quality > 0.52) quality -= 0.05
    else {
      width = Math.max(160, Math.round(width * 0.85))
      height = Math.max(1, Math.round(height * 0.85))
    }
    blob = await jpeg(render(decoded, width, height), quality)
  }
  if (blob.size > 120 * 1024) throw new Error('無法建立足夠小的照片縮圖')
  return blob
}

/**
 * 收據分析用的圖片：只產一張 JPEG，不做縮圖 —— 它只送去辨識，不會上傳 Drive。
 *
 * 目標值刻意跟 processPhoto 的 'receipt' 不同：那組 450KB 是為了「存進 Drive 的收據照片」訂的。
 * 這條路唯一的天花板是後端的 base64 長度上限（1.5M 字元 ≈ 1.1MB），而 Gemini 按像素計價、
 * 不看位元組 —— 壓到 450KB 一毛錢都沒省，只是把日文小字壓糊。
 *
 * 所以品質固定在高檔，要縮就縮解析度：JPEG 在細小文字上的振鈴假影正是辨識殺手。
 * 絕大多數照片一次編碼就過關，下面兩個迴圈根本不會跑。
 */
const SCAN_TARGET_BYTES = 900 * 1024
const SCAN_HARD_BYTES = 1_000_000
const SCAN_MIN_WIDTH = 1000

export interface ReceiptScan {
  blob: Blob
  width: number
  height: number
}

export const processReceiptScan = async (file: File): Promise<ReceiptScan> => {
  const decoded = await decodeImage(file)
  try {
    if (!decoded.width || !decoded.height) throw new Error('照片尺寸無效')

    // 超長收據若只限制寬度，可能超過 iOS Canvas 的像素上限而完全無法輸出。
    const capped = fit(decoded.width, decoded.height, 1400, Number.POSITIVE_INFINITY)
    let { width, height } = fitPixels(capped.width, capped.height, 12_000_000)
    let quality = 0.85
    let blob = await jpeg(render(decoded, width, height), quality)

    // 檔案大小約與像素數成正比，直接估出下一個尺寸，不要一階一階試。
    for (let attempt = 0; blob.size > SCAN_TARGET_BYTES && width > SCAN_MIN_WIDTH && attempt < 2; attempt++) {
      const nextWidth = Math.max(
        SCAN_MIN_WIDTH,
        Math.round(width * Math.sqrt(SCAN_TARGET_BYTES / blob.size) * 0.95),
      )
      if (nextWidth >= width) break
      height = Math.max(1, Math.round(height * (nextWidth / width)))
      width = nextWidth
      blob = await jpeg(render(decoded, width, height), quality)
    }

    // 縮到下限還是太大（極長的收據）才動品質，那是最後手段不是第一手段。
    while (blob.size > SCAN_HARD_BYTES && quality > 0.65) {
      quality = Math.max(0.65, quality - 0.1)
      blob = await jpeg(render(decoded, width, height), quality)
    }

    if (blob.size > SCAN_HARD_BYTES) throw new Error('收據過長，壓縮後仍超過 1 MB')
    return { blob, width, height }
  } finally {
    decoded.dispose()
  }
}

export const processPhoto = async (file: File, kind: Photo['kind']): Promise<ProcessedPhoto> => {
  const decoded = await decodeImage(file)
  try {
    if (!decoded.width || !decoded.height) throw new Error('照片尺寸無效')
    const [full, thumbnailBlob] = await Promise.all([
      makeFullImage(decoded, kind),
      makeThumbnail(decoded),
    ])
    return {
      kind,
      fullBlob: full.blob,
      thumbnailBlob,
      width: full.width,
      height: full.height,
      byteSize: full.blob.size,
      mimeType: 'image/jpeg',
    }
  } finally {
    decoded.dispose()
  }
}
