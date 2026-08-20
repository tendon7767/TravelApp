import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal from './Modal'
import { checkForUpdate } from '../lib/update'

/** 配色只有兩種，不做「跟隨系統」——多一個狀態要處理，但這是單人裝置的偏好。 */
const THEMES = [
  ['dark', '深色'],
  ['light', '亮色'],
] as const

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
  const [updateStatus, setUpdateStatus] = useState('')
  const theme = useStore((s) => s.settings.theme ?? 'dark')
  const setTheme = useStore((s) => s.setTheme)
  const dirty =
    draft.trim() !== memberName ||
    urlDraft.trim() !== gasUrl ||
    folderDraft.trim() !== driveFolderId

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
    setUpdateStatus('檢查中…')
    try {
      if (await checkForUpdate()) {
        setUpdateStatus('已取得新版，重新載入中…')
        location.reload()
      } else {
        setUpdateStatus('已經是最新版')
      }
    } catch (err) {
      setUpdateStatus(err instanceof Error ? `檢查失敗：${err.message}` : String(err))
    }
  }

  const connect = async () => {
    setStatus('測試連線中…')
    try {
      const version = await setGasUrl(urlDraft)
      // 顯示後端版本，否則沒辦法分辨「部署了新版」和「還在跑舊版」。
      setStatus(
        urlDraft.trim()
          ? version
            ? `連線成功 · 後端版本 ${version}`
            : '連線成功，但後端沒回報版本（可能是舊版，請重新部署）'
          : '已清除',
      )
    } catch (err) {
      setStatus(err instanceof Error ? `連不上：${err.message}` : String(err))
    }
  }

  return (
    <Modal title="設定" onCancel={onClose} onComplete={save} dirty={dirty}>
      <div style={{ paddingTop: 12 }}>
        <label className="label" htmlFor="s-name">你的名字</label>
        <input
          id="s-name"
          className="field"
          value={draft}
          placeholder="阿嘎"
          onChange={(e) => setDraft(e.target.value)}
        />
        <p className="settings-hint">
          心得的署名。同一人在各裝置要用同一個名字；改名後舊心得會一起更新。
        </p>
      </div>

      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 14 }}>
        <span className="label">配色</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              className="btn btn-sm"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="settings-hint">只影響這台裝置，不會同步。</p>
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
        <p className="settings-hint">設定一次，所有旅程共用。步驟見 SETUP.md。</p>

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
        <p className="settings-hint">每趟旅程在這底下開專屬資料夾。留空則用「旅遊資料」。</p>
      </div>

      <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 14 }}>
        <span className="label">App 版本</span>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          {buildLabel}<span className="dim mono" style={{ fontSize: 12 }}> · {__BUILD_SHA__}</span>
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <button className="btn btn-sm" onClick={() => void update()}>檢查更新</button>
          {updateStatus && <span className="dim" style={{ fontSize: 12 }}>{updateStatus}</span>}
        </div>
        <p className="settings-hint">
          有新版就下載並重新載入。剛部署完可能還拿到舊版，過一下再按一次。
        </p>
      </div>
    </Modal>
  )
}
