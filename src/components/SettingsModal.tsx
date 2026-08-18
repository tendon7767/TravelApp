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
  const gasUrl = useStore((s) => s.settings.gasUrl ?? '')
  const setGasUrl = useStore((s) => s.setGasUrl)
  const [urlDraft, setUrlDraft] = useState(gasUrl)
  const [status, setStatus] = useState('')
  const driveFolderId = useStore((s) => s.settings.driveFolderId ?? '')
  const setDriveFolder = useStore((s) => s.setDriveFolder)
  const [folderDraft, setFolderDraft] = useState(driveFolderId)
  const [folderStatus, setFolderStatus] = useState('')

  const save = () => {
    const next = draft.trim()
    if (next && next !== memberName) setMemberName(next)
    onClose()
  }

  const checkFolder = async () => {
    setFolderStatus('確認中…')
    try {
      const path = await setDriveFolder(folderDraft)
      setFolderStatus(`將建立於：${path}`)
    } catch (err) {
      setFolderStatus(err instanceof Error ? `找不到：${err.message}` : String(err))
    }
  }

  const connect = async () => {
    setStatus('測試連線中…')
    try {
      await setGasUrl(urlDraft)
      setStatus(urlDraft.trim() ? '連線成功' : '已清除')
    } catch (err) {
      setStatus(err instanceof Error ? `連不上：${err.message}` : String(err))
    }
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

      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 14 }}>
        <label className="label" htmlFor="s-gas">後端網址（Apps Script）</label>
        <input
          id="s-gas"
          className="field"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec"
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => void connect()}>測試並儲存</button>
          {status && <span className="dim" style={{ fontSize: 12 }}>{status}</span>}
        </div>
        <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
          只需設定一次，所有旅程共用。設定步驟見專案裡的 SETUP.md。
        </p>

        <label className="label" style={{ marginTop: 14 }} htmlFor="s-folder">
          旅程資料夾的存放位置
        </label>
        <input
          id="s-folder"
          className="field"
          value={folderDraft}
          onChange={(e) => setFolderDraft(e.target.value)}
          placeholder="貼上雲端硬碟資料夾網址，留空則用「旅遊資料」"
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => void checkFolder()}>確認並儲存</button>
          {folderStatus && <span className="dim" style={{ fontSize: 12 }}>{folderStatus}</span>}
        </div>
        <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
          每趟旅程會在這個位置底下開一個以旅程名稱命名的資料夾，試算表放在裡面。
          留空的話用根目錄的「旅遊資料」。
        </p>
      </div>
    </Modal>
  )
}
