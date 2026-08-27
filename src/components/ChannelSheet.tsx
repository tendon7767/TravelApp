import { useMemo, useState } from 'react'
import { channelKey, sameChannel, sortChannels } from '../lib/channels'
import Modal from './Modal'
import PencilIcon from './PencilIcon'
import TrashIcon from './TrashIcon'

interface Props {
  /** 這條規則目前選了哪些通路。 */
  selected: string[]
  /** 全 App 用過的通路（跨旅程、跨卡片、跨規則的聯集）。 */
  all: string[]
  /** 這個名字除了眼前這條規則之外，還有幾條規則在用。 */
  usedElsewhere: (name: string) => number
  /** 勾選即時寫進外層的支付方式草稿。 */
  onSelect: (channels: string[]) => void
  /**
   * 編輯模式按儲存。改名（key 是正規化後的舊名）是真儲存，新增只能進草稿。
   * 兩件事一定要交給同一支去做：分成兩個回呼的話，第二個會拿還沒套用改名的草稿當底，
   * 把第一個寫進去的新名字整批蓋回舊的 —— 存檔後名字自己變回去，而且完全不報錯。
   */
  onSave: (renames: Map<string, string>, added: string[]) => void
  onClose: () => void
}

/**
 * 通路標籤彈窗，兩種模式，差別在「影響範圍」而不只是外觀：
 *
 * - **選取模式**（預設）：勾選只影響眼前這條規則，而且即時寫進外層草稿，
 *   所以它是總覽型 —— 底部一條「關閉」，沒有取消可言（草稿的生死關在外層的支付方式編輯）。
 * - **編輯模式**：改名會動到別張卡的規則與所有消費，所以它是編輯型，要按儲存才生效。
 *
 * 新增只能走草稿：清單是衍生的，「沒有任何規則引用的標籤」在這個系統裡不存在，
 * 所以新標籤唯一能存在的地方就是這條規則的 channels。因此新增即勾選，
 * 而外層按取消時它會跟著消失（改過的名字則已經存進去了）—— 外層的放棄確認會講這件事。
 */
export default function ChannelSheet({
  selected,
  all,
  usedElsewhere,
  onSelect,
  onSave,
  onClose,
}: Props) {
  const [editing, setEditing] = useState(false)
  /** 正規化後的原名 → 改成什麼。只有編輯模式在動。 */
  const [renames, setRenames] = useState<Map<string, string>>(new Map())
  /** 這次在編輯模式新增、還沒按儲存的那幾個。 */
  const [added, setAdded] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  /*
   * a-z 排序只在編輯期間凍住：名稱可以就地編輯，邊打邊重排的話手指底下那一列會自己跳走。
   * 離開編輯模式就放掉，改回跟著最新的 all 走，否則剛改好的名字還會顯示成舊的。
   */
  const [frozen, setFrozen] = useState<string[] | null>(null)
  const rows = useMemo(
    () => (frozen ? [...frozen, ...added] : sortChannels(all)),
    [frozen, added, all],
  )

  const nameOf = (name: string) => renames.get(channelKey(name)) ?? name
  const isSelected = (name: string) => selected.some((picked) => sameChannel(picked, name))

  const toggle = (name: string) => {
    onSelect(
      isSelected(name)
        ? selected.filter((picked) => !sameChannel(picked, name))
        : [...selected, name],
    )
  }

  const rename = (name: string, next: string) =>
    setRenames((current) => {
      const map = new Map(current)
      if (next === name) map.delete(channelKey(name))
      else map.set(channelKey(name), next)
      return map
    })

  /* 打字新增時正規化後撞到既有標籤，就當成選了那一個，不要建出第二筆同名的。 */
  const addDraft = () => {
    const name = draft.trim()
    if (!name) return
    setDraft('')
    const existing = rows.find((row) => sameChannel(nameOf(row), name))
    if (existing) {
      if (!isSelected(existing)) toggle(existing)
      return
    }
    setAdded((current) => [...current, name])
  }

  const dirty = renames.size > 0 || added.length > 0

  const cancelEditing = () => {
    setRenames(new Map())
    setAdded([])
    setDraft('')
    setFrozen(null)
    setEditing(false)
  }

  /*
   * 儲存時兩件事一起交出去，但它們的去處不同：改名進真資料（被改的東西已經在資料裡了），
   * 新增只能進外層草稿（清單是衍生的，沒有規則引用的標籤在這個系統裡不存在）。
   * 還沒按「加入」就直接按儲存的那一格也要收進去，不然打完字按儲存會什麼都沒發生。
   */
  const saveEditing = () => {
    const pending = draft.trim()
    const newNames =
      pending && !rows.some((row) => sameChannel(nameOf(row), pending)) ? [...added, pending] : added
    onSave(renames, newNames)
    setRenames(new Map())
    setAdded([])
    setDraft('')
    setFrozen(null)
    setEditing(false)
  }

  if (editing) {
    return (
      <Modal
        title="編輯通路"
        onCancel={cancelEditing}
        onComplete={saveEditing}
        completeDisabled={!dirty && !draft.trim()}
        dirty={dirty}
      >
        <div className="channel-list">
          {/* 編輯模式整欄不出現勾選框：這裡改的是全 App 的名字，不是這條規則用不用它。 */}
          {rows.map((name) => {
            const others = added.includes(name) ? 0 : usedElsewhere(name)
            const merging = rows.some(
              (other) => other !== name && sameChannel(nameOf(other), nameOf(name)),
            )
            return (
              <div key={name} className="channel-row">
                <input
                  className="field"
                  type="search"
                  enterKeyHint="done"
                  autoComplete="off"
                  value={nameOf(name)}
                  onChange={(e) => rename(name, e.target.value)}
                  aria-label={`通路名稱：${name}`}
                />
                {/* 垃圾桶只給這次剛新增的：把別張卡在用的標籤從全 App 拿掉會靜默改掉別人的回饋。 */}
                {added.includes(name) ? (
                  <button
                    className="btn btn-sm delete-icon-btn"
                    onClick={() => setAdded((current) => current.filter((row) => row !== name))}
                    aria-label={`不要新增${name}`}
                  >
                    <TrashIcon />
                  </button>
                ) : (
                  <span className="channel-used dim">
                    {others > 0 ? `另有 ${others} 條方案在用` : ''}
                  </span>
                )}
                {merging && <span className="channel-merge">會與同名的合併成一個</span>}
              </div>
            )
          })}

          <div className="channel-row">
            <input
              className="field"
              type="search"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="新增通路"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={addDraft}
              aria-label="新增通路"
            />
            <button className="btn btn-sm" onClick={addDraft} disabled={!draft.trim()}>
              加入
            </button>
          </div>
          <p className="dim channel-hint">新增的通路會直接套用在這條規則上，按外層的儲存才會留下。</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="適用通路"
      onCancel={onClose}
      headAction={
        <button
          className="icon-btn"
          onClick={() => {
            setFrozen(sortChannels(all))
            setEditing(true)
          }}
          aria-label="編輯通路"
        >
          <PencilIcon />
        </button>
      }
    >
      <div className="channel-list">
        {rows.length === 0 && (
          <p className="dim" style={{ margin: 0 }}>
            還沒有任何通路。按右上角的鉛筆新增。
          </p>
        )}
        {rows.map((name) => (
          <label key={name} className="channel-row channel-pick">
            <input type="checkbox" checked={isSelected(name)} onChange={() => toggle(name)} />
            <span className="channel-name">{name}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
