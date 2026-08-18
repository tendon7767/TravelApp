import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore'

/** 邀請連結的落地頁：把後端網址、試算表、密鑰收下並拉一次資料。 */
export default function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const joinTrip = useStore((s) => s.joinTrip)
  const ready = useStore((s) => s.ready)
  const [error, setError] = useState('')
  const started = useRef(false)

  const gasUrl = params.get('u') ?? ''
  const sheetId = params.get('s') ?? ''
  const secret = params.get('k') ?? ''

  useEffect(() => {
    if (!ready || started.current) return
    if (!gasUrl || !sheetId || !secret) {
      setError('邀請連結不完整')
      return
    }
    started.current = true
    void joinTrip(gasUrl, sheetId, secret)
      .then((tripId) => navigate(tripId ? `/trip/${tripId}` : '/', { replace: true }))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [ready, gasUrl, sheetId, secret, joinTrip, navigate])

  return (
    <div className="empty">
      {error ? (
        <>
          <div style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>
          <button className="btn btn-sm" onClick={() => navigate('/')}>回到旅程列表</button>
        </>
      ) : (
        '加入旅程中…'
      )}
    </div>
  )
}
