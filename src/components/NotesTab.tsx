import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Note, NoteBlock, Trip } from '../types'
import { newId } from '../lib/id'
import { makeLink } from '../lib/maps'
import { isSubmitEnter } from '../lib/keys'
import ConfirmButton from './ConfirmButton'
import Modal from './Modal'
import { DEFAULT_PACKING } from '../store/db'
import TrashIcon from './TrashIcon'
import PencilIcon from './PencilIcon'
import MapPinIcon from './MapPinIcon'
import LinkIcon from './LinkIcon'
import { fetchLinkMetadata } from '../sync/client'

const PACKING_TITLE = '打包清單'

export default function NotesTab({ trip }: { trip: Trip }) {
  const allNotes = useStore((s) => s.data.notes)
  const createNote = useStore((s) => s.createNote)
  const updateNote = useStore((s) => s.updateNote)
  const template = useStore((s) => s.settings.packingTemplate)
  /** isNew 決定取消時要不要把剛建立的空筆記收掉。 */
  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null)
  const notes = useMemo(
    () => allNotes.filter((n) => n.tripId === trip.id && !n.deleted),
    [allNotes, trip.id],
  )
  const editingNote = editing ? notes.find((n) => n.id === editing.id) : undefined

  // 新旅程會自動帶打包清單，但更早建立的旅程沒有，補一個入口讓它們也拿得到範本。
  const hasPacking = notes.some((n) => n.title.trim() === PACKING_TITLE)
  const addPacking = () => {
    const note = createNote(trip.id, PACKING_TITLE)
    updateNote(note.id, {
      blocks: (template ?? DEFAULT_PACKING).map((text) => ({
        id: newId(),
        kind: 'check' as const,
        text,
        done: false,
      })),
    })
  }

  return (
    <>
      <div className="sec" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          onClick={() => setEditing({ id: createNote(trip.id).id, isNew: true })}
        >
          ＋ 新增筆記
        </button>
        {!hasPacking && (
          <button className="btn btn-sm" onClick={addPacking}>
            ＋ 打包清單（帶入範本）
          </button>
        )}
      </div>

      {notes.length === 0 && <div className="empty">還沒有筆記。</div>}
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onEdit={() => setEditing({ id: note.id, isNew: false })} />
      ))}

      {editingNote && editing && (
        <NoteEditorModal
          key={editingNote.id}
          trip={trip}
          note={editingNote}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

/**
 * 卡片本身唯讀，只有勾選例外 —— 邊打包邊勾是打包清單的主要用法，
 * 要求先開編輯彈窗才能打勾等於把這個功能廢掉。內容與結構的編輯一律走鉛筆。
 */
function NoteCard({ note, onEdit }: { note: Note; onEdit: () => void }) {
  const updateNote = useStore((s) => s.updateNote)
  const title = note.title || '未命名筆記'
  const checks = note.blocks.filter((b) => b.kind === 'check')
  const packed = checks.filter((b) => b.done).length
  const isPacking = note.title.trim() === PACKING_TITLE

  return (
    <div className="sec">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ flex: 1, minWidth: 0, fontSize: 16 }}>{title}</strong>
        <button className="btn btn-sm" onClick={onEdit} aria-label={`編輯 ${title}`}>
          <PencilIcon />
        </button>
      </div>

      {checks.length > 0 && (
        <div className="dim mono" style={{ fontSize: 11, marginBottom: 6 }}>
          已勾 {packed} / {checks.length}
        </div>
      )}

      {note.blocks.map((b) => (
        <div key={b.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
          {b.kind === 'check' ? (
            <input
              type="checkbox"
              checked={Boolean(b.done)}
              onChange={(e) =>
                updateNote(note.id, {
                  blocks: note.blocks.map((v) => (v.id === b.id ? { ...v, done: e.target.checked } : v)),
                })
              }
              aria-label={`勾選 ${b.text}`}
              style={{ flex: 'none', width: 18, height: 18 }}
            />
          ) : (
            <span className="dim" style={{ flex: 'none', width: 18, textAlign: 'center' }}>
              ¶
            </span>
          )}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              whiteSpace: 'pre-wrap',
              textDecoration: b.done ? 'line-through' : undefined,
              opacity: b.done ? 0.55 : 1,
            }}
          >
            {b.text || '—'}
          </span>
        </div>
      ))}

      {!isPacking && note.links.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {note.links.map((link) => (
            <a key={link.id} className="chip" href={link.url} target="_blank" rel="noreferrer">
              {link.kind === 'map' ? <MapPinIcon size={13} /> : <LinkIcon size={13} />}
              {link.label || link.url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function NoteEditorModal({
  trip,
  note,
  isNew,
  onClose,
}: {
  trip: Trip
  note: Note
  isNew: boolean
  onClose: () => void
}) {
  const updateNote = useStore((s) => s.updateNote)
  const removeNote = useStore((s) => s.removeNote)
  const savePackingTemplate = useStore((s) => s.savePackingTemplate)
  const template = useStore((s) => s.settings.packingTemplate)
  const gasUrl = useStore((s) => s.settings.gasUrl)
  const tripLink = useStore((s) => s.settings.tripLinks?.[trip.id])
  const [linkDraft, setLinkDraft] = useState('')
  const [resolvingLink, setResolvingLink] = useState(false)
  const [linkLookupError, setLinkLookupError] = useState('')
  const [saved, setSaved] = useState(false)
  const [templateNote, setTemplateNote] = useState('')

  /*
   * 進入編輯就複製一份來改，按完成才寫回。
   * 即時寫入的話，打「岡山城」三個字會產生三次記錄變更，
   * 同步是後寫入者勝，同行者剛寫完的內容可能被你打到一半的半成品蓋掉。
   * 只在掛載時取一次快照：編輯途中若同步拉回新版本，不該把正在改的草稿沖掉。
   */
  const [draft, setDraft] = useState<Note>(() => ({
    ...note,
    blocks: note.blocks.map((b) => ({ ...b })),
    links: note.links.map((l) => ({ ...l })),
  }))

  const patch = (value: Partial<Note>) => setDraft((current) => ({ ...current, ...value }))
  const setBlocks = (blocks: NoteBlock[]) => patch({ blocks })
  const patchBlock = (id: string, value: Partial<NoteBlock>) =>
    setBlocks(draft.blocks.map((b) => (b.id === id ? { ...b, ...value } : b)))

  /** 打勾清單一條接一條打，Enter 直接開下一行，不用每次去按新增。 */
  const addBlock = (kind: NoteBlock['kind'], after?: string) => {
    const block: NoteBlock = { id: newId(), kind, text: '', done: kind === 'check' ? false : undefined }
    if (!after) return setBlocks([...draft.blocks, block])
    const idx = draft.blocks.findIndex((b) => b.id === after)
    setBlocks([...draft.blocks.slice(0, idx + 1), block, ...draft.blocks.slice(idx + 1)])
  }

  const addLink = async () => {
    if (!linkDraft.trim() || resolvingLink) return
    const parsed = makeLink(linkDraft)
    let link = parsed
    setLinkLookupError('')

    if (gasUrl && tripLink && /^https?:\/\//i.test(parsed.url)) {
      setResolvingLink(true)
      try {
        const metadata = await fetchLinkMetadata(gasUrl, tripLink, parsed.url)
        link = {
          ...parsed,
          url: metadata.url || parsed.url,
          label: metadata.label.trim() || parsed.label || (parsed.kind === 'map' ? draft.title : ''),
        }
      } catch {
        setLinkLookupError('無法讀取連結名稱，已使用預設備援名稱。')
      } finally {
        setResolvingLink(false)
      }
    }
    if (!link.label && link.kind === 'map') link = { ...link, label: draft.title }
    patch({ links: [...draft.links, link] })
    setLinkDraft('')
  }

  const dirty =
    draft.title !== note.title ||
    JSON.stringify(draft.blocks) !== JSON.stringify(note.blocks) ||
    JSON.stringify(draft.links) !== JSON.stringify(note.links)

  /** 新增後取消不能留下一則空筆記，比照支付方式把它收掉。 */
  const cancel = () => {
    if (isNew) removeNote(note.id)
    onClose()
  }

  const complete = () => {
    updateNote(note.id, { title: draft.title, blocks: draft.blocks, links: draft.links })
    onClose()
  }

  /**
   * 範本是「附加」而不是「取代」：取代會把使用者自己加的項目清掉。
   * 已經在清單裡的品項也略過，重複按不會長出兩份護照。
   */
  const addTemplate = () => {
    const source = template ?? DEFAULT_PACKING
    const existing = new Set(draft.blocks.map((b) => b.text.trim()).filter(Boolean))
    const added = source.map((t) => t.trim()).filter((t) => t && !existing.has(t))
    if (!added.length) {
      setTemplateNote('範本項目都已經在清單裡了')
      return
    }
    setBlocks([
      ...draft.blocks,
      ...added.map<NoteBlock>((text) => ({ id: newId(), kind: 'check', text, done: false })),
    ])
    setTemplateNote(`已加入 ${added.length} 項`)
  }

  const checks = draft.blocks.filter((b) => b.kind === 'check')
  const isPacking = draft.title.trim() === PACKING_TITLE

  return (
    <Modal
      title={isNew ? '新增筆記' : '編輯筆記'}
      onCancel={cancel}
      onComplete={complete}
      dirty={dirty}
    >
      <div style={{ paddingTop: 12 }}>
        <label className="label" htmlFor="note-title">筆記標題</label>
        <input
          id="note-title"
          className="field"
          style={{ fontSize: 15, fontWeight: 600 }}
          value={draft.title}
          placeholder="未命名筆記"
          onChange={(e) => patch({ title: e.target.value })}
        />

        <div style={{ marginTop: 12 }}>
          <span className="label">內容</span>
          {draft.blocks.map((b) => (
            <div key={b.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
              {b.kind === 'check' ? (
                <input
                  type="checkbox"
                  checked={Boolean(b.done)}
                  onChange={(e) => patchBlock(b.id, { done: e.target.checked })}
                  aria-label={`勾選 ${b.text}`}
                  style={{ flex: 'none', width: 18, height: 18 }}
                />
              ) : (
                <span className="dim" style={{ flex: 'none', width: 18, textAlign: 'center' }}>
                  ¶
                </span>
              )}
              <input
                className="field"
                style={{
                  flex: 1,
                  minWidth: 0,
                  textDecoration: b.done ? 'line-through' : undefined,
                  opacity: b.done ? 0.55 : 1,
                }}
                value={b.text}
                onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                onKeyDown={(e) => isSubmitEnter(e) && addBlock(b.kind, b.id)}
                aria-label="內容"
              />
              <button
                className="btn btn-sm delete-icon-btn"
                onClick={() => patchBlock(b.id, { kind: b.kind === 'check' ? 'text' : 'check', done: false })}
                title={b.kind === 'check' ? '改成文字段落' : '改成勾選項'}
              >
                {b.kind === 'check' ? '¶' : '☑'}
              </button>
              <button
                className="btn btn-sm delete-icon-btn"
                onClick={() => setBlocks(draft.blocks.filter((v) => v.id !== b.id))}
                aria-label="刪除這一行"
              >
                <TrashIcon />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => addBlock('check')}>＋ 勾選項</button>
            <button className="btn btn-sm" onClick={() => addBlock('text')}>＋ 文字</button>
            <button className="btn btn-sm" onClick={addTemplate}>帶入打包範本</button>
            {checks.length > 0 && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  updateNote(note.id, { blocks: draft.blocks })
                  savePackingTemplate(note.id)
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2500)
                }}
              >
                {saved ? '已存為範本' : '存成下次的範本'}
              </button>
            )}
          </div>
          {templateNote && (
            <p className="dim" style={{ fontSize: 11, margin: '6px 0 0' }}>{templateNote}</p>
          )}
        </div>

        {!isPacking && (
          <div style={{ marginTop: 14 }}>
            <span className="label">連結</span>
            {draft.links.map((l) => (
              <div key={l.id} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                <span className="dim" aria-hidden="true" style={{ flex: 'none' }}>
                  {l.kind === 'map' ? <MapPinIcon size={15} /> : <LinkIcon size={15} />}
                </span>
                <input
                  className="field"
                  style={{ flex: 1, minWidth: 0 }}
                  value={l.label}
                  placeholder={l.url}
                  onChange={(e) =>
                    patch({
                      links: draft.links.map((v) => (v.id === l.id ? { ...v, label: e.target.value } : v)),
                    })
                  }
                  aria-label="連結名稱"
                />
                <a className="btn btn-sm" href={l.url} target="_blank" rel="noreferrer">開啟</a>
                <button
                  className="btn btn-sm delete-icon-btn"
                  onClick={() => patch({ links: draft.links.filter((v) => v.id !== l.id) })}
                  aria-label="刪除這個連結"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="field"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => isSubmitEnter(e) && void addLink()}
                aria-label="新增連結"
              />
              <button className="btn" disabled={resolvingLink} onClick={() => void addLink()}>
                {resolvingLink ? '讀取中…' : '加入'}
              </button>
            </div>
            {linkLookupError && <p className="dim link-lookup-error">{linkLookupError}</p>}
          </div>
        )}

        {/*
          * 刪除放在內容最下方，比照 PaymentEditor；取消與完成統一由彈窗底部負責。
          * 新增流程不顯示：這時取消本來就會把剛建立的空筆記收掉，兩個鍵是同一件事。
          */}
        {!isNew && (
          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 14 }}>
            <ConfirmButton
              label="刪除這則筆記"
              question="刪除這則筆記？"
              onConfirm={() => {
                removeNote(note.id)
                onClose()
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
