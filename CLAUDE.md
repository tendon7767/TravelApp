# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開發指令

Node.js 裝在 `~/.local/node`，不是系統路徑，每個新 shell 都要先設定：

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 本機開發（Vite，port 5173）。也可用 preview 工具的 `travelapp-dev` 設定啟動 |
| `npm run build` | `tsc -b && vite build`，型別錯誤會擋住建置 |
| `npm run lint` | oxlint |
| `npm run preview` | 預覽建置產物 |

沒有測試框架，沒有測試檔。驗證改動的方式是 `npm run build` 加上在 preview 裡實際操作。

後端 `apps-script/Code.gs` 無法從本機執行或測試，只能貼到 Apps Script 專案裡部署。

## 這是什麼

給單一使用者與同行者用的旅遊規劃 PWA。React 19 + TypeScript + Vite + zustand + react-router 7。資料存在瀏覽器 IndexedDB，離線完全可用；同步的後端是使用者自己的 Google Apps Script 部署，一趟旅程對應一份 Google 試算表。沒有伺服器、沒有登入、沒有帳號系統 —— 身分只是 `settings.memberName` 這個暱稱字串。

介面文字與程式碼註解都是繁體中文，新增的請照做。

## 資料流

```
IndexedDB (idb-keyval)  ←→  zustand store  ←→  React
                              ↓ pull / push
                    Apps Script Web App  →  Google 試算表 + Drive
```

- **[src/store/useStore.ts](src/store/useStore.ts)** 是整個 app 唯一的 store，也是最大的檔案。所有寫入都走 `mutate()`，它會遞增 `localRev` 並以 250ms debounce 寫進 IndexedDB。
- **`localRev` 只在本機編輯時遞增**，同步拉回來的資料不算。UI 靠它判斷「該推上去了」；若拉取也遞增就會無限自我觸發。改動 store 時務必維持這個性質。
- **[src/store/db.ts](src/store/db.ts)** 負責載入時的資料遷移。舊版存下來的資料一定會出現在真實裝置上，`loadData()` 裡的遷移邏輯不能刪。
- **[src/sync/](src/sync/)**：`collect.ts` 挑出屬於某趟、且 `updatedAt > lastPushedAt` 的記錄；`client.ts` 負責 HTTP 與合併。

## 同步模型（改動前務必理解）

每筆同步記錄都繼承 `SyncFields`（`id` / `updatedAt` / `updatedBy` / `deleted?`）。要同步的集合列在 `SYNCED_COLLECTIONS`；`settings` 是各裝置自己的，永不上傳。

- **刪除一律是軟刪墓碑**，不是移除陣列元素。刪掉父層（plan、item）時要連帶為子層（items、reviews、photos）建立墓碑，否則同步後會留下孤兒記錄 —— 參考 `removePlan` / `removeItem`。
  - 例外：`removeTrip` 是「只從這台裝置移除」，直接清資料與本機連結，不建墓碑，雲端試算表完全不動。
- **衝突解決是逐筆「後寫入者勝」**，比較 `updatedAt`。所以資料結構的切法決定了會不會弄丟東西：`Review`（心得）刻意做成獨立記錄而不是 `Item` 的欄位，因為一人一則、只有作者本人會寫，整筆覆蓋也不會蓋到別人。**新增多人各自編輯的內容時要沿用這個作法。**
- 本機較新的修改被遠端蓋掉時記進 `sync.overwritten`，由 UI 提示，不讓它默默消失。
- **順序永遠是 pull → merge → push**。先推的話本機的新修改會在下一次拉取被舊資料覆蓋。
- 後端 `push` 會拒絕 `updatedAt` 比現有列舊的記錄並回傳 `rejected`；前端收到後立刻再拉一次收斂畫面。
- 同一趟同時只允許一個 pull→push 流程（`syncFlights`）；`syncVersions` 讓刪除旅程能作廢進行中的請求，因為 fetch 無法可靠取消。

### 不能改的細節

**同步請求必須用 `Content-Type: text/plain`。** Apps Script 的 Web App 不處理 OPTIONS 預檢，只有「簡單請求」才拿得回回應。換成 `application/json` 整條同步會壞掉。

## 日期與時間

Google Sheets 會把看起來像日期的字串自動轉成 Date cell，舊版後端再把它序列化成完整 ISO timestamp，而 iOS Safari 的 `<input type="date">` 只接受 `YYYY-MM-DD`。因此：

- 後端 `SCHEMA` 把 `dates` / `times` 欄位明確寫成純文字。
- 前端在**三個地方**都做正規化：載入（`db.ts`）、合併遠端（`client.ts` 的 `normalizeRemoteRow`）、推送前（`collect.ts`）。工具函式在 [src/lib/date.ts](src/lib/date.ts)。
- 合併時若遠端日期無法解析，保留本機值；若是新記錄則整筆拒絕套用。一次 pull 不能把還能用的行程變成空白。

新增日期欄位時，這幾處都要一起處理。

## 照片

只有 `kind === 'actual'` 的行程版本能加照片。流程：[src/photos/process.ts](src/photos/process.ts) 在瀏覽器用 canvas 壓縮並產縮圖 → 存進 IndexedDB 佇列（[queue.ts](src/photos/queue.ts)）→ base64 上傳到 Apps Script → 檔案落在該趟的 Drive 資料夾，metadata 進試算表的 `photos` 分頁。

- **安全性：後端的一般 `push` 只接受既有照片的刪除墓碑，不接受新增或改寫。** 照片列只能由 `uploadPhoto` 建立。否則拿到旅程密鑰的人可以偽造 `fileId`，讓後端去刪帳號裡其他 Drive 檔案。
- 縮圖靠 service worker 的 CacheFirst 規則（見 [vite.config.ts](vite.config.ts)）離線可看，刪除照片時要一併清快取。
- 後端能力靠 `ping` 回傳的 `capabilities.photos` 判斷。舊後端會靜默忽略 `photos` 集合，所以偵測到不支援時要保留 `lastPushedAt` 不前進，重新部署後才補得回來。

## 版面與互動的雷區

這幾條都踩過，共同點是「本機看起來正常、真機才炸」或「當下沒事、之後某次改動才引爆」。

- **捲動層一律要擋掉橫向。** `overflow-y: auto` 會讓沒指定的 `overflow-x` 從 `visible` 被算成 `auto`，內容只要寬出去一點點，整個版面就能左右拖動並回彈，看起來像壞掉。新增捲動容器時照抄 `.scroll / .page-scroll / .pane-scroll / .itinerary-scroll` 那組的 `overflow-x: hidden` + `touch-action: pan-y`。唯一該橫捲的 `.daystrip` 是它們的兄弟不是子孫，不受影響。
- **量到的高度寫成 CSS 變數，不要在 CSS 裡硬寫數字。** `--topbar-h` / `--tabbar-h`（`TripPage`）、`--dayhead-h` / `--reviewrow-h`（`ReviewTab`）都是量出來的，因為它們隨字型、縮放與內容換行而變。
- **量高度要先同步寫一次，再交給 `ResizeObserver` 管後續變化。** 它的回呼掛在瀏覽器的算繪步驟上，**分頁在背景時不會送達** —— 只靠它的話初值永遠停在 fallback，而且是靜默的，畫面只是位置怪怪的不會報錯。
- **iOS 鍵盤升起時版面視窗不會縮，只有可視視窗縮。** 畫面底部那段被鍵盤蓋住，在流內的底部按鈕列就消失了。`--kb`（[src/lib/keyboard.ts](src/lib/keyboard.ts)）量的就是這段：蓋板用它調 `inset`（`.pane-detail`），流內版面用它加 `padding-bottom`（`.review-view`）。Android 的版面視窗會跟著縮，`--kb` 算出來是 0，同一條規則自動失效，不用寫兩套。
- **使用者輸入的文字都要 `overflow-wrap: anywhere`。** 沒有空白的長字串（英文店名、訂位代號、貼上來的網址）預設不斷行；`min-width: 0` 只讓它縮不讓它斷，照樣頂破版面。
- **巢狀點擊區要 `stopPropagation()`。** 整列是 `role="button"` 而列裡又有按鈕或連結時（`.row-action`、`.review-write-hint`）不擋冒泡會兩層一起觸發。小圖示的點擊區用 `::after` 撐開而不是把元素本身放大，版面才不受影響 —— 但別撐出容器右緣，那就變成上面第一條的橫向拖動。

## 其他值得知道的

- **回饋計算只認 `kind === 'actual'` 的版本**（[src/lib/rewards.ts](src/lib/rewards.ts)）。一張卡可有多組同時累積的規則；消費上限不獨立儲存，它恆等於 `rewardCap / rate`。
- **介面文字講「消費」不講「刷卡」。** 支付方式包含電子支付，「刷卡明細」「已刷 N 筆」對悠遊付、LINE Pay 這類根本不成立。同理，泛稱時用「支付方式」而不是「卡片」。
- **邀請連結就是通行證**：`#/join?u=<後端網址>&s=<試算表 ID>&k=<密鑰>`。密鑰存在試算表的 `_meta` 分頁，撤銷方式是去改那一列。
- **本機儲存隨時可能被清空，所以邀請連結要備份到雲端。** `tripLinks`（試算表 ID + 密鑰）跟旅程資料在同一個 IndexedDB，瀏覽器清除是整個 origin 一起清，鑰匙會跟資料一起消失。因此同步時會呼叫後端 `saveInvite`，把連結寫進該趟試算表的「邀請連結」分頁 —— 使用者手上唯一還在的線索就是雲端硬碟裡那份試算表。連結字串由前端算（後端不知道前端網域），存進 `tripLinks[].inviteBackupUrl` 避免每次同步重送；能力由 `ping` 的 `capabilities.invite` 判斷。
- 啟動時呼叫 `navigator.storage.persist()`（[src/lib/storage.ts](src/lib/storage.ts)）。Android Chrome 拿到後就豁免容量淘汰；iOS Safari 沒有實作這個 API，分頁模式下七天沒互動仍會被清，只有加到主畫面的 PWA 不受影響。
- **中文輸入法**：所有「按 Enter 送出」的地方都要用 [src/lib/keys.ts](src/lib/keys.ts) 的 `isSubmitEnter`。注音選字階段的 Enter 是確認選字，不是送出。
- **樣式集中在單一檔案** [src/styles.css](src/styles.css)，沒有 CSS-in-JS 或模組化。
- **心得有兩個介面，共用同一批 `Review` 記錄**：詳細行程頁的心得區塊，以及行程列表的心得模式（[ReviewTab.tsx](src/components/ReviewTab.tsx)，網址參數 `mode=review`，只在實際版出現）。日期橫條與捲動連動由 `useDayScroller` / `DayStrip` 共用 —— 那段對 sticky 與 rect 相減很敏感，要用就共用，不要複製。
- **純本機的偏好放 `settings`，不要為了它動同步層。** `settings` 從不上傳，加 optional 欄位連遷移都不用寫（舊資料讀進來就是 `undefined`）。心得配色 `reviewHues` 就是這樣做的：為了顏色進同步層，就得處理「兩個人同時改配色」這種毫無價值的衝突。

## 部署

- 前端：push 到 `main` 觸發 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)，建置時用 `GITHUB_PAGES_BASE` 帶入 repo 名稱當 base。
- 後端：**改完 `Code.gs` 必須「部署 → 管理部署作業 → 編輯 → 版本選新版本 → 部署」。直接存檔不會更新線上版本**，這是最常見的坑。改動後端行為時同步更新 `BACKEND_VERSION`；用瀏覽器直接開部署網址就能看到目前線上是哪一版。

使用者端的完整設定步驟在 [SETUP.md](SETUP.md)。README.md 仍是 Vite 樣板，沒有專案資訊。
