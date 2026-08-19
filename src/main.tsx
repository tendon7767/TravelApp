import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { watchKeyboard } from './lib/keyboard'
import { requestPersistentStorage } from './lib/storage'
import './styles.css'

watchKeyboard()
// 不擋啟動：拿不拿得到永久儲存都不影響這次的使用。
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
