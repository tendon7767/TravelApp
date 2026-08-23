# 介面地圖

看得到的東西該怎麼稱呼。左邊是叫法，右邊是它在程式裡的樣子。
詞彙的正式定義在 [CLAUDE.md](CLAUDE.md) 的「詞彙表」，新增叫法時兩邊都要補。

```
首頁（旅程列表）                                      TripsPage.tsx
├── 頂列                                             .topbar
│   └── ⚙ → 設定彈窗（名字、配色、後端網址）           SettingsModal.tsx
│          ├── 每一格都是改了就生效，底部只有「關閉」
│          └── 欄位說明藏在標題旁的 ⓘ，點一下就地展開
├── ＋新增旅程 ／ ＋加入旅程
├── 旅程列                                           .row
│   └── 高亮的那一列 ＝ 導航列另外三格會進到的那趟      .row[data-on]
├── 版本列（檢查更新）                                .app-version-bar
└── 導航列                                           .tabbar ← 與旅程頁共用

旅程頁                                               TripPage.tsx
├── 頂列                                             .topbar
│   ├── 旅程名 → 旅程設定彈窗                         .topbar-title → TripSettings.tsx
│   │              ├── 摘要（名稱、日期、匯率）＋編輯   .trip-summary
│   │              │      └── 編輯 → 編輯旅程彈窗      TripFields.tsx（唯一有草稿的一層）
│   │              ├── 版本切換（二選一）              PlanSwitcher.tsx / .seg
│   │              ├── 心得配色 ／ 雲端同步 ／ 刪除
│   │              └── 關閉（其餘全部即時生效）        .sheet-close-wide
│   ├── 匯率 · 同步狀態（點了立刻同步）                .topbar-sync
│   ├── 心得模式鍵（只有實際版有）
│   └── 搜尋                                         SearchPanel.tsx
│
├── 行程                                             ItineraryTab.tsx
│   ├── 日期橫條 ── 膠囊 ── 膠囊底                     .daystrip / .daypill / ::before
│   │      └── 左右撥換日；實膠囊底＝落定、淡＝拖曳中   useDaySwipe.ts
│   ├── 日期標題（當日合計）                          .dayhead
│   ├── 行程列                                       .row
│   │   └── 點開 → 詳細頁                            .pane-detail / ItemDetail.tsx
│   │       ├── 捲到盡頭再往下／上滑 → 滑進下一筆／上一筆行程
│   │       ├── 區段（基本資訊、花費、照片、心得）
│   │       │      └── 地圖連結在基本資訊：標題右側的針＝開地圖，編輯時是時間下面那格
│   │       └── 取消／儲存                            .editor-actions
│   ├── now 鈕                                       .now-fab
│   └── 心得模式（同一頁的另一種樣子）                 ReviewTab.tsx / mode=review
│       ├── 一列一則心得，共用日期橫條
│       ├── 點自己的氣泡或列尾的筆 → 就地變成輸入框     .detail-review-edit
│       └── 離開輸入框就存，沒有取消／儲存             「還原上一版」是救援路線
│
├── 回饋                                             RewardsTab.tsx
│   ├── ＋新增支付方式 ／ 從其他旅程複製
│   ├── 持有人橫條（同樣是膠囊與膠囊底）               .daystrip
│   ├── 三格軌道（上一格／這一格／下一格）             .pager-track / SwipePager.tsx
│   │      └── 左右撥換持有人
│   ├── 支付方式卡 → 新增／編輯支付方式彈窗            PaymentEditor.tsx
│   └── 這趟沒帶                                     .chip
│
├── 筆記                                             NotesTab.tsx
│   ├── ＋新增筆記 ／ ＋打包清單
│   ├── 筆記橫條（膠囊是筆記標題）                     .daystrip
│   └── 三格軌道 → 筆記卡 → 編輯筆記彈窗              SwipePager.tsx
│
├── 花費（從行程頁的「全程合計」進去，不在導航列）      ExpensesTab.tsx
├── 相簿（實際版才有）                                AlbumView.tsx
└── 導航列：首頁 ／ 行程 ／ 回饋 ／ 筆記                .tabbar / TabBar.tsx

彈窗                                                 Modal.tsx
├── 蓋板（點它關掉＝取消）                             .backdrop
├── 標題列（右邊的 ✕ 一律在，關閉＝取消）               .sheethead / .icon-btn
├── sheet：底部升起，有內容要編輯                      .sheet
│      └── 上緣切齊頂列的下緣，背後看得到完整一條頂列
├── picker：置中，點一個就關（選支付方式、消費明細）     .sheet[data-variant=picker]
├── 取消／儲存（編輯型：內容是草稿）                   .sheetactions
│      ├── 沒鍵盤：sticky 貼在彈窗底
│      └── 鍵盤升起：跟著內容捲，要捲到最底才按得到      :root[data-kb]
└── 關閉（總覽型：每一格都即時生效）                    .sheet-close-wide
       └── 整條都是那顆按鈕，點哪裡都關得掉
```

## 分不出來時補一個限定詞

- 哪一頁：行程 ／ 回饋 ／ 筆記 ／ 首頁
- 哪個版本：規劃版 ／ 實際版（配色與回饋計算都跟著它變）
- 哪個主題：亮色 ／ 深色
