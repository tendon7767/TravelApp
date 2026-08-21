import { useState, type ReactNode } from 'react'
import { useStore } from '../store/useStore'
import Modal from './Modal'
import AppVersion from './AppVersion'
import InfoIcon from './InfoIcon'
import MoonIcon from './MoonIcon'
import SunIcon from './SunIcon'

/** 配色只有兩種，不做「跟隨系統」——多一個狀態要處理，但這是單人裝置的偏好。 */
const THEMES = [
  ['dark', '深色', MoonIcon],
  ['light', '亮色', SunIcon],
] as const

/**
 * 欄位標題與它的說明。說明平常收起來，點 ⓘ 就地展開。
 * 不做長按叫浮泡：標題是 <label>，長按結束的那一下會 focus 到欄位、在手機上叫出鍵盤，
 * 還要跟 iOS 自己的選取與複製手勢搶；更根本的是看不見的入口沒人會去按。
 * 也刻意不做浮層 —— 彈窗內容區是擋掉橫向的捲動層，浮層只要比欄位寬一點就會被切掉。
 */
function Label({
  htmlFor,
  text,
  open,
  onToggle,
}: {
  htmlFor?: string
  text: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="setting-label">
      {htmlFor ? (
        <label className="label" htmlFor={htmlFor}>{text}</label>
      ) : (
        <span className="label">{text}</span>
      )}
      <button
        className="hint-btn"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${text}的說明`}
      >
        <InfoIcon />
      </button>
    </div>
  )
}

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
  const theme = useStore((s) => s.settings.theme ?? 'dark')
  const setTheme = useStore((s) => s.setTheme)
  /* 還沒設定過後端的人，最需要看的就是那一格的說明，預設攤開。 */
  const [hints, setHints] = useState<Record<string, boolean>>(() => ({ gas: !gasUrl }))
  const toggleHint = (key: string) => setHints((current) => ({ ...current, [key]: !current[key] }))

  /*
   * 名字改完立刻生效，不進草稿：它只影響之後寫的內容（心得署名、同步時的 updatedBy），
   * 不會回頭改舊資料，改錯的代價就是再改一次。
   * 但空字串不寫進去 —— 要換名字一定得先把舊的刪光，那一瞬間若寫進 store，
   * 首頁標題會退回「我的旅程」，期間寫的心得也會沒有署名。
   */
  const changeName = (value: string) => {
    setDraft(value)
    const next = value.trim()
    if (next && next !== memberName) setMemberName(next)
  }

  /*
   * 這一頁只剩後端網址與資料夾是草稿（要按各自的按鈕才生效），所以底部沒有儲存鍵，
   * 但 dirty 仍要傳：打了一半的網址按 ✕ 或點蓋板時，還是要攔一下再關。
   */
  const dirty = urlDraft.trim() !== gasUrl || folderDraft.trim() !== driveFolderId

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

  const section = (children: ReactNode) => (
    <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 14 }}>
      {children}
    </div>
  )

  return (
    <Modal title="設定" onCancel={onClose} dirty={dirty}>
      <div>
        <Label htmlFor="s-name" text="你的名字" open={!!hints.name} onToggle={() => toggleHint('name')} />
        <input
          id="s-name"
          className="field"
          autoComplete="off"
          value={draft}
          placeholder="阿嘎"
          onChange={(e) => changeName(e.target.value)}
        />
        {hints.name && (
          <p className="settings-hint">
            心得的署名，也是同步時「這筆是誰改的」的依據。改了只影響之後寫的內容，
            不會回頭改舊資料。同一個人在多台裝置上設一樣的名字，就會被當成同一人。
          </p>
        )}
      </div>

      {section(
        <>
          <Label text="配色" open={!!hints.theme} onToggle={() => toggleHint('theme')} />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {THEMES.map(([value, label, Icon]) => (
              <button
                key={value}
                className="btn theme-btn"
                aria-pressed={theme === value}
                aria-label={label}
                title={label}
                onClick={() => setTheme(value)}
              >
                <Icon />
              </button>
            ))}
          </div>
          {hints.theme && (
            <p className="settings-hint">
              深色是預設。這個選擇只存在這台裝置，不會同步給同行者，換裝置要各設一次。
            </p>
          )}
        </>,
      )}

      {section(
        <>
          <Label
            htmlFor="s-gas"
            text="後端網址（Apps Script）"
            open={!!hints.gas}
            onToggle={() => toggleHint('gas')}
          />
          <input
            id="s-gas"
            className="field"
            autoComplete="off"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => void connect()}>測試並儲存</button>
            {status && <span className="dim" style={{ fontSize: 12 }}>{status}</span>}
          </div>
          {hints.gas && (
            <p className="settings-hint">
              你自己部署的 Apps Script 網址，設定一次、所有旅程共用。沒有它 App 照樣能用，
              只是資料只留在這台裝置上，不會有雲端備份，也沒辦法跟同行者共用一趟旅程。
              「測試並儲存」會實際連一次後端，確認回報得出版本才存起來。部署步驟見 SETUP.md。
            </p>
          )}
        </>,
      )}

      {section(
        <>
          <Label
            htmlFor="s-folder"
            text="旅程資料夾的存放位置"
            open={!!hints.folder}
            onToggle={() => toggleHint('folder')}
          />
          <input
            id="s-folder"
            className="field"
            autoComplete="off"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            placeholder="貼上雲端硬碟資料夾網址，留空則用「旅遊資料」"
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => void checkFolder()}>確認並儲存</button>
            {folderStatus && <span className="dim" style={{ fontSize: 12 }}>{folderStatus}</span>}
          </div>
          {hints.folder && (
            <p className="settings-hint">
              每趟旅程會在這個資料夾底下開一個專屬資料夾，放那一趟的試算表與照片。
              留空則用雲端硬碟根目錄下的「旅遊資料」。貼上資料夾的網址即可，
              App 會自己取出其中的 ID 並確認拿得到那個資料夾。
            </p>
          )}
        </>,
      )}

      {section(<AppVersion />)}
    </Modal>
  )
}
