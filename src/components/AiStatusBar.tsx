import { useStore } from '../store/useStore'
import SpinnerIcon from './SpinnerIcon'
import SparkleIcon from './SparkleIcon'

interface Props {
  planId: string
  onSelect: (itemId: string) => void
}

/**
 * 左下角的地點分析狀態。只在有話說的時候存在 —— 沒有進行中也沒有待處理時，
 * 它不是變灰也不是縮小，是整個不算繪，因為「全部順利跑完」不需要被通知。
 *
 * 只算目前這一版行程的項目：分析跑幾秒就結束，跨旅程的情境幾乎不存在，
 * 而讓浮標把人一路帶去另一趟旅程，那個跳躍太大。
 */
export default function AiStatusBar({ planId, onSelect }: Props) {
  const pending = useStore((state) => state.ai.pending)
  const errors = useStore((state) => state.ai.errors)
  const items = useStore((state) => state.data.items)

  const mine = (id: string) =>
    items.some((item) => item.id === id && item.planId === planId && !item.deleted)

  const running = pending.filter(mine)
  const failed = Object.keys(errors).filter(mine)
  if (!running.length && !failed.length) return null

  // 失敗優先：還在跑的等一下自己會好，待處理的不點進去就不會消失。
  const target = failed[0] ?? running[0]

  return (
    <button
      className="ai-status"
      data-failed={failed.length > 0 || undefined}
      onClick={() => onSelect(target)}
      title={failed.length ? '跳到待處理的那一筆' : '跳到分析中的那一筆'}
    >
      {failed.length ? <SparkleIcon size={14} /> : <SpinnerIcon size={14} />}
      <span>
        {failed.length ? `${failed.length} 筆待處理` : `分析中 ${running.length}`}
      </span>
    </button>
  )
}
