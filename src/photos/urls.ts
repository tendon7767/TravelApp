/**
 * Drive 的 `getDownloadUrl()` 回傳的是帶臨時存取權杖的網址：只有當下那個帳號、
 * 而且很快就會過期，放進 `<img>` 一律變破圖。公開網址只能由 fileId 組出來。
 *
 * 顯示時一律現算而不用試算表裡存的 `thumbnailUrl` / `fileUrl`，舊資料才不必重傳。
 */
export const photoThumbnailUrl = (fileId: string): string =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w480&travelapp=thumb`

export const photoFullUrl = (fileId: string): string =>
  `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=w2560`
