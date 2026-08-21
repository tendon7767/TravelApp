/**
 * 「取消編輯／完成編輯」那一列。三個地方用它：詳細行程、心得模式，
 * 以及鍵盤升起時浮在鍵盤上緣的那一排。同樣四個字就該長一樣、行為一樣 ——
 * 沒改動時完成是 disabled，取消有改動時要先問過。
 *
 * 提交的內容各處不同（寫進 store 或只是收鍵盤），所以那部分留給呼叫端，
 * 這裡只負責這一列本身。
 */
export default function EditActions({
  dirty,
  onCancel,
  onComplete,
  className = 'editor-actions',
  keepFocus = false,
}: {
  /** 決定「完成編輯」能不能按。 */
  dirty: boolean
  onCancel: () => void
  onComplete: () => void
  className?: string
  /** 浮在鍵盤上的那一排要吃掉 pointerdown，不然點下去欄位先失焦、這排當場消失。 */
  keepFocus?: boolean
}) {
  return (
    <div
      className={className}
      onPointerDown={keepFocus ? (event) => event.preventDefault() : undefined}
    >
      <button className="btn" onClick={onCancel}>取消編輯</button>
      <button className="btn btn-primary" onClick={onComplete} disabled={!dirty}>
        完成編輯
      </button>
    </div>
  )
}
