import { useState } from 'react'
import { useStore } from '../store/useStore'
import { buildInviteLink } from '../sync/client'
import type { Trip } from '../types'

/** 每趟旅程一份試算表，所以連結、邀請、同步都掛在旅程底下。 */
export default function SyncSection({ trip }: { trip: Trip }) {
  const gasUrl = useStore((s) => s.settings.gasUrl)
  const link = useStore((s) => s.settings.tripLinks?.[trip.id])
  const inviteApiVersion = useStore((s) => s.settings.inviteApiVersion)
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
        <>
          <button className="btn btn-sm" onClick={connect} disabled={busy}>
            {busy ? '建立中…' : '在雲端硬碟建立這趟的試算表'}
          </button>
          <p className="dim" style={{ fontSize: 12, margin: 0 }}>
            會在雲端硬碟的 TravelApp 資料夾裡建立一份試算表，並產生一組只有這趟用的密鑰。
          </p>
        </>
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
          <p className="dim" style={{ fontSize: 11, margin: 0 }}>
            邀請連結含試算表與密鑰，拿到的人就能讀寫這趟 —— 只傳給同行的人。
          </p>
          <p className="dim" style={{ fontSize: 11, margin: 0 }}>
            {(inviteApiVersion ?? 0) >= 1
              ? '同步時會自動把這段連結存進試算表的「邀請連結」分頁。手機資料被瀏覽器清空時，從雲端硬碟打開這趟的試算表就能找回來。'
              : '重新部署 Apps Script 後，這段連結會自動備份到試算表裡，手機資料被清空時才有辦法找回這趟。'}
          </p>
        </>
      )}

      {(error || sync.error) && (
        <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{error || sync.error}</p>
      )}
    </div>
  )
}
