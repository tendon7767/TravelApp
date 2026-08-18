# 上線設定

程式碼都寫好了，剩下兩件事只能你本人操作，因為那是你的 Google 帳號與 GitHub 帳號。
兩件事互相獨立，先做哪個都可以。

---

## 一、Google 後端（只做一次，之後每趟旅程都自動建立試算表）

1. 打開 <https://script.google.com>，按「新增專案」
2. 把專案裡的預設程式碼全部刪掉，貼上本專案 `apps-script/Code.gs` 的完整內容
3. 左上角把專案改名為 `TravelApp`（方便日後找到），按 Ctrl/Cmd + S 儲存
4. 右上角「部署」→「新增部署作業」
5. 齒輪圖示選「網頁應用程式」，然後：
   - **執行身分**：我
   - **誰可以存取**：所有人
6. 按「部署」。Google 會要求授權：
   - 出現「這個應用程式未經驗證」時，點「進階」→「前往 TravelApp（不安全）」
   - 這是因為這支程式是你自己寫的、沒有經過 Google 審核，不是真的有問題
   - 授權項目會包含存取雲端硬碟與試算表，因為它要幫你建立與讀寫旅程檔案
7. 複製「網頁應用程式」那一行的網址，長得像
   `https://script.google.com/macros/s/AKfy.../exec`
8. 回到 App → 旅程列表右上角 ⚙ →「後端網址」貼上 → 按「測試並儲存」，顯示「連線成功」就完成

### 之後怎麼用

- 打開任一趟旅程 →「編輯」→ 雲端同步 →「在雲端硬碟建立這趟的試算表」
- 建好後同一個位置會出現「立即同步」與「複製邀請連結」
- 邀請連結傳給同行者，他們點開就自動設定完成，不用再貼任何東西

### 安全性

- 網頁應用程式設成「所有人」可存取，但每份試算表有自己的密鑰，寫在試算表的 `_meta` 分頁
- 沒有密鑰的請求一律被拒絕，等於**邀請連結就是通行證**
- 所以邀請連結只傳給同行的人。想撤銷就去試算表的 `_meta` 分頁改掉 `secret` 那一列

### 修改程式碼之後

改完 `Code.gs` 要「部署」→「管理部署作業」→ 編輯（鉛筆）→ 版本選「新版本」→ 部署。
直接存檔不會更新線上版本，這是 Apps Script 最常見的坑。

---

## 二、放到 GitHub Pages（手機才連得上）

1. 到 <https://github.com> 註冊或登入，建立一個新的 repository，例如 `travelapp`（公開或私有都可以）
2. 在專案目錄執行（把網址換成你的 repo）：

   ```bash
   git remote add origin https://github.com/<你的帳號>/travelapp.git
   git push -u origin main
   ```

3. 到該 repo 的 Settings → Pages → Build and deployment → Source 選 **GitHub Actions**
4. 推送後 Actions 會自動建置與部署，網址是
   `https://<你的帳號>.github.io/travelapp/`
5. 手機用 Safari 或 Chrome 打開該網址 → 分享 →「加入主畫面」

之後每次 `git push` 到 main 都會自動重新部署。

---

## 在本機開發

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm run dev
```

Node.js 裝在 `~/.local/node`，沒有動到系統目錄。不需要時直接刪掉那個資料夾即可。
