import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import TripsPage from './pages/TripsPage'
import TripPage from './pages/TripPage'
import JoinPage from './pages/JoinPage'

export default function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const theme = useStore((s) => s.settings.theme ?? 'dark')

  useEffect(() => {
    void init()
  }, [init])

  // 設定視窗是 portal 到 body 的，變數只寫在 .app 上它會留在原本的配色，所以掛在 <html>。
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // 讓捲軸、input 這些原生控制項跟著換，否則亮底上會出現深色捲軸。
    document.documentElement.style.colorScheme = theme
    // 安裝時的 manifest theme_color 是固定值，狀態列要靠這個 meta 才會跟著變。
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#ffffff' : '#161b22')
  }, [theme])

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
