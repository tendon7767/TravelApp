import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import TripsPage from './pages/TripsPage'
import TripPage from './pages/TripPage'
import JoinPage from './pages/JoinPage'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return <div className="empty">載入中…</div>

  return (
    <Routes>
      <Route path="/" element={<TripsPage />} />
      <Route path="/trip/:tripId" element={<TripPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
