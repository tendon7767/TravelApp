import { useState } from 'react'
import { useStore } from '../store/useStore'
import { buildInviteLink } from '../sync/client'
import type { Trip } from '../types'

/** 每趟旅程一份試算表，所以連結、邀請、同步都掛在旅程底下。 */
export default function SyncSection({ trip }: { trip: Trip }) {
  const gasUrl = useStore((s) => s.settings.gasUrl)
  const link = useStore((s) => s.settings.tripLinks?.[trip.id])
  const sync = useStore((s) => s.sync)
  const connectTrip = useStore((s) => s.connectTrip)
  const syncTrip = useStore((s) => s.syncTrip)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      await connectTrip(trip.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const copyInvite = async () => {
    if (!gasUrl || !link) return
    await navigator.clipboard.writeText(buildInviteLink(gasUrl, link))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (!gasUrl) {
    return (
      <p className="dim" style={{ fontSize: 12, margin: 0 }}>
        還沒設定後端網址。到旅程列表右上角的 ⚙ 貼上 Apps Script 網址後，這裡就能把資料同步到雲端硬碟。
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {!link ? (
        /* 外層是 grid，按鈕直接放進去會被拉滿整行。包成跟已連線那一支同樣的一排，
           寬度就由文字決定並靠左，兩支的形狀也一致。 */
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={connect} disabled={busy}>
            {busy ? '建立中…' : '在雲端硬碟建立這趟的試算表'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => void syncTrip(trip.id)} disabled={sync.busy}>
              {sync.busy ? '同步中…' : '立即同步'}
            </button>
            <button className="btn btn-sm" onClick={copyInvite}>
              {copied ? '已複製邀請連結' : '複製邀請連結'}
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12, margin: 0 }}>
            {sync.lastAt ? `上次同步 ${new Date(sync.lastAt).toLocaleString('zh-TW')}` : '尚未同步過'}
          </p>
        </>
      )}

      {(error || sync.error) && (
        <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{error || sync.error}</p>
      )}
    </div>
  )
}
