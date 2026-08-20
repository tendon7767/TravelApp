import { useState } from 'react'
import { checkForUpdate } from '../lib/update'

/**
 * App 版本與手動更新。設定頁與旅程清單頁各放一份 ——
 * 開發期間常常要在手機上抓新版，藏在設定頁裡太深。
 */
export default function AppVersion() {
  const [status, setStatus] = useState('')

  // 建置時間存的是 UTC 的 ISO 字串，顯示時換成這台裝置的當地時間。
  const buildLabel = new Date(__BUILD_TIME__).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const update = async () => {
    setStatus('檢查中…')
    try {
      if (await checkForUpdate()) {
        setStatus('已取得新版，重新載入中…')
        location.reload()
      } else {
        setStatus('已經是最新版')
      }
    } catch (err) {
      setStatus(err instanceof Error ? `檢查失敗：${err.message}` : String(err))
    }
  }

  return (
    <>
      <span className="label">App 版本</span>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        {buildLabel}<span className="dim mono" style={{ fontSize: 12 }}> · {__BUILD_SHA__}</span>
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
        <button className="btn btn-sm" onClick={() => void update()}>檢查更新</button>
        {status && <span className="dim" style={{ fontSize: 12 }}>{status}</span>}
      </div>
      <p className="settings-hint">有新版就下載並重新載入</p>
    </>
  )
}
