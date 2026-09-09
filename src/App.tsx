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
  }, [theme])

  /*
   * 狀態列（時間、電量那排）的底色。安裝成 PWA 之後畫面**沒有**延伸到它後面
   * （實測 Chrome 152 / Android：safe-area-inset-top 是 0，視窗 697 對螢幕 780），
   * 那條由系統畫，底色取自這個 meta —— manifest 的 theme_color 是安裝時的固定值，
   * 跟著主題換要靠這裡。
   *
   * **跟著系統的深淺色走，不是跟著 App 主題。** Android 把狀態列的圖示顏色綁在
   * 系統深淺色上（系統深色＝白圖示），而且不看 theme-color 的明暗去調整。
   * 所以底色只要挑「跟圖示對得起來」的那一端：亮色 App 配深色系統時曾經是
   * 白底白字，整條時間電量直接消失，而不是變淡。
   *
   * 代價是那種組合下狀態列會跟頂列不同色（白色頂列上面一條深的）。
   * 那是看得見與看不見的差別，不是好不好看的差別。
   * iOS 不受影響：它的 PWA 狀態列走 apple-mobile-web-app-status-bar-style，本來就正常。
   */
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const paint = () => meta.setAttribute('content', dark.matches ? '#161b22' : '#ffffff')
    paint()
    dark.addEventListener('change', paint)
    return () => dark.removeEventListener('change', paint)
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
