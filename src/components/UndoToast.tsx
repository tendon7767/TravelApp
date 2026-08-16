import { useEffect } from 'react'
import { useStore } from '../store/useStore'

/** 刪除後給 10 秒反悔，手滑刪掉一整天不會就這樣沒了。 */
export default function UndoToast() {
  const undo = useStore((s) => s.undo)
  const runUndo = useStore((s) => s.runUndo)
  const clearUndo = useStore((s) => s.clearUndo)

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(clearUndo, Math.max(0, undo.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [undo, clearUndo])

  if (!undo) return null

  return (
    <div className="undo" role="status">
      <span>{undo.label}</span>
      <button onClick={runUndo} style={{ color: 'inherit', fontWeight: 500 }}>
        復原
      </button>
    </div>
  )
}
