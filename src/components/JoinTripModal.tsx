import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { parseInviteLink } from '../sync/client'
import Modal from './Modal'

/**
 * 貼上邀請連結加入旅程。
 * 邀請連結原本只能用點的（JoinPage），但 iOS 主畫面 App 有自己獨立的儲存空間，
 * 而連結一定開在 Safari 裡 —— 換裝置或重新加到主畫面時，貼上是唯一走得通的路。
 */
export default function JoinTripModal({ onClose }: { onClose: () => void }) {
  const joinTrip = useStore((s) => s.joinTrip)
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const paste = async () => {
    setError('')
    try {
      const clip = await navigator.clipboard.readText()
      if (clip.trim()) setText(clip.trim())
    } catch {
      setError('無法讀取剪貼簿，請長按輸入框手動貼上。')
    }
  }

  const submit = async () => {
    if (busy) return
    const invite = parseInviteLink(text)
    if (!invite) {
      setError('這不是有效的邀請連結，請確認整條連結都複製到了。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const tripId = await joinTrip(invite.gasUrl, invite.sheetId, invite.secret)
      onClose()
      navigate(tripId ? `/trip/${tripId}` : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="加入旅程"
      onCancel={onClose}
      onComplete={() => void submit()}
      completeLabel={busy ? '加入中…' : '加入'}
      /* 空的才灰掉。格式不對不灰 —— 貼了半條連結的人只會看到按鈕壞掉，
         不如讓他按下去，由 parseInviteLink 的錯誤訊息說出哪裡不對。 */
      completeDisabled={!text.trim() || busy}
      dirty={text.trim().length > 0}
    >
      <div>
        <label className="label" htmlFor="join-invite">邀請連結</label>
        <input
          id="join-invite"
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://…/#/join?u=…&s=…&k=…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => void paste()}>從剪貼簿貼上</button>
        </div>
        <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
          從同行者那裡拿到的邀請連結，或是自己在另一台裝置上「複製邀請連結」得到的那一串。
          加入後會拉一次雲端資料，之後就跟原本一樣同步。
        </p>
        {error && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '8px 0 0' }}>{error}</p>}
      </div>
    </Modal>
  )
}
