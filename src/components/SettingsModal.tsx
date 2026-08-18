import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal from './Modal'

/**
 * 暱稱是這台裝置的身分：心得掛在誰名下、之後同步時誰改了什麼，都看它。
 * 不做登入，同一個人在多台裝置上設一樣的名字就會被當成同一人。
 */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const memberName = useStore((s) => s.settings.memberName)
  const setMemberName = useStore((s) => s.setMemberName)
  const [draft, setDraft] = useState(memberName)

  const save = () => {
    const next = draft.trim()
    if (next && next !== memberName) setMemberName(next)
    onClose()
  }

  return (
    <Modal title="設定" onClose={save}>
      <div style={{ paddingTop: 12 }}>
        <label className="label" htmlFor="s-name">你的名字</label>
        <input
          id="s-name"
          className="field"
          value={draft}
          placeholder="阿嘎"
          onChange={(e) => setDraft(e.target.value)}
        />
        <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
          用來標示心得是誰寫的。同一個人在手機和電腦上要設成同樣的名字；
          同行者在自己的裝置上設自己的名字。改名後，你先前寫的心得會一起換上新名字。
        </p>
      </div>
    </Modal>
  )
}
