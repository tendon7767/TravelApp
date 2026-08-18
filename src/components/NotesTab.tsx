import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Note, NoteBlock, Trip } from '../types'
import { newId } from '../lib/id'
import { makeLink } from '../lib/maps'
import { isSubmitEnter } from '../lib/keys'
import ConfirmButton from './ConfirmButton'
import { DEFAULT_PACKING } from '../store/db'

export default function NotesTab({ trip }: { trip: Trip }) {
  const allNotes = useStore((s) => s.data.notes)
  const createNote = useStore((s) => s.createNote)
  const updateNote = useStore((s) => s.updateNote)
  const template = useStore((s) => s.settings.packingTemplate)
  const [editingId, setEditingId] = useState<string | null>(null)
  const notes = useMemo(
    () => allNotes.filter((n) => n.tripId === trip.id && !n.deleted),
    [allNotes, trip.id],
  )

  // 新旅程會自動帶打包清單，但更早建立的旅程沒有，補一個入口讓它們也拿得到範本。
  const hasPacking = notes.some((n) => n.title.trim() === '打包清單')
  const addPacking = () => {
    const note = createNote(trip.id, '打包清單')
    updateNote(note.id, {
      blocks: (template ?? DEFAULT_PACKING).map((text) => ({
        id: newId(),
        kind: 'check' as const,
        text,
        done: false,
      })),
    })
  }

  const addNote = () => {
    const note = createNote(trip.id)
    setEditingId(note.id)
  }

  return (
    <>
      <div className="sec" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={addNote}>
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
        <NoteCard
          key={note.id}
          note={note}
          editing={editingId === note.id}
          onEdit={() => setEditingId(note.id)}
          onDone={() => setEditingId(null)}
        />
      ))}
    </>
  )
}

function NoteCard({
  note,
  editing,
  onEdit,
  onDone,
}: {
  note: Note
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const updateNote = useStore((s) => s.updateNote)
  const removeNote = useStore((s) => s.removeNote)
  const savePackingTemplate = useStore((s) => s.savePackingTemplate)
  const [linkDraft, setLinkDraft] = useState('')
  const [saved, setSaved] = useState(false)

  const setBlocks = (blocks: NoteBlock[]) => updateNote(note.id, { blocks })

  const patchBlock = (id: string, patch: Partial<NoteBlock>) =>
    setBlocks(note.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  /** 打勾清單一條接一條打，Enter 直接開下一行，不用每次去按新增。 */
  const addBlock = (kind: NoteBlock['kind'], after?: string) => {
    const block: NoteBlock = { id: newId(), kind, text: '', done: kind === 'check' ? false : undefined }
    if (!after) return setBlocks([...note.blocks, block])
    const idx = note.blocks.findIndex((b) => b.id === after)
    setBlocks([...note.blocks.slice(0, idx + 1), block, ...note.blocks.slice(idx + 1)])
  }

  const addLink = () => {
    if (!linkDraft.trim()) return
    updateNote(note.id, { links: [...note.links, makeLink(linkDraft)] })
    setLinkDraft('')
  }

  const checks = note.blocks.filter((b) => b.kind === 'check')
  const packed = checks.filter((b) => b.done).length
  const isPacking = note.title.trim() === '打包清單'

  return (
    <div className="sec">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        {editing ? (
          <input
            className="field"
            style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}
            value={note.title}
            onChange={(e) => updateNote(note.id, { title: e.target.value })}
            aria-label="筆記標題"
          />
        ) : (
          <strong style={{ flex: 1, minWidth: 0, fontSize: 16 }}>{note.title || '未命名筆記'}</strong>
        )}
        <button className={editing ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={editing ? onDone : onEdit}>
          {editing ? '完成' : '編輯'}
        </button>
        {editing && (
          <ConfirmButton
            label="刪除"
            question="刪除這則筆記？"
            onConfirm={() => {
              removeNote(note.id)
              onDone()
            }}
          />
        )}
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
              onChange={(e) => patchBlock(b.id, { done: e.target.checked })}
              aria-label={`勾選 ${b.text}`}
              style={{ flex: 'none', width: 18, height: 18 }}
            />
          ) : (
            <span className="dim" style={{ flex: 'none', width: 18, textAlign: 'center' }}>
              ¶
            </span>
          )}
          {editing ? (
            <>
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
                className="btn btn-sm"
                onClick={() => patchBlock(b.id, { kind: b.kind === 'check' ? 'text' : 'check', done: false })}
                title={b.kind === 'check' ? '改成文字段落' : '改成勾選項'}
              >
                {b.kind === 'check' ? '¶' : '☑'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setBlocks(note.blocks.filter((v) => v.id !== b.id))}
                aria-label="刪除這一行"
              >
                ✕
              </button>
            </>
          ) : (
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
          )}
        </div>
      ))}

      {editing && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => addBlock('check')}>＋ 勾選項</button>
          <button className="btn btn-sm" onClick={() => addBlock('text')}>＋ 文字</button>
          {checks.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={() => {
                savePackingTemplate(note.id)
                setSaved(true)
                setTimeout(() => setSaved(false), 2500)
              }}
            >
              {saved ? '已存為範本' : '存成下次的範本'}
            </button>
          )}
        </div>
      )}

      {!isPacking && editing && (
        <div style={{ marginTop: 10 }}>
          <span className="label">連結</span>
          {note.links.map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
              <span className="dim" aria-hidden="true" style={{ flex: 'none' }}>
                {l.kind === 'map' ? '◎' : '↗'}
              </span>
              <input
                className="field"
                style={{ flex: 1, minWidth: 0 }}
                value={l.label}
                placeholder={l.url}
                onChange={(e) =>
                  updateNote(note.id, {
                    links: note.links.map((v) => (v.id === l.id ? { ...v, label: e.target.value } : v)),
                  })
                }
                aria-label="連結名稱"
              />
              <a className="btn btn-sm" href={l.url} target="_blank" rel="noreferrer">開啟</a>
              <button
                className="btn btn-sm"
                onClick={() => updateNote(note.id, { links: note.links.filter((v) => v.id !== l.id) })}
                aria-label="刪除這個連結"
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="field"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => isSubmitEnter(e) && addLink()}
              aria-label="新增連結"
            />
            <button className="btn" onClick={addLink}>加入</button>
          </div>
        </div>
      )}

      {!isPacking && !editing && note.links.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {note.links.map((link) => (
            <a key={link.id} className="chip" href={link.url} target="_blank" rel="noreferrer">
              {link.kind === 'map' ? '◎' : '↗'} {link.label || link.url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
