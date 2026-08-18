/**
 * TravelApp 後端。部署一次即可，之後每趟旅程都由程式自動建立試算表。
 *
 * 部署方式：
 *   1. 到 script.google.com 建立新專案，把這整份貼進去
 *   2. 部署 → 新增部署作業 → 類型選「網頁應用程式」
 *   3. 執行身分：我；誰可以存取：所有人
 *   4. 授權後複製網址，貼回 App 的設定頁
 *
 * 為什麼「所有人」也還算安全：每份試算表有自己的密鑰，寫在 _meta 分頁裡。
 * 沒有密鑰的請求一律拒絕，等於邀請連結就是通行證。
 */

var FOLDER_NAME = '旅遊資料'

/** 部署後在 App 的「測試並儲存」會顯示這個字串，用來確認新版本真的上線了。 */
var BACKEND_VERSION = '2026-08-19c'

/** 每次修復邏輯有變動就換一個 key，讓既有試算表重新執行修復。 */
var TEXT_COLUMNS_REPAIR_KEY = 'textColumnsFixedV2'

/**
 * 每個分頁的欄位。json 裡的欄位以 JSON 字串存進單一儲存格。
 * dates/times 必須明確格式化，否則試算表會自動轉成 Date，API 回傳時日期會受時區位移。
 */
var SCHEMA = {
  trips: {
    fields: ['id', 'name', 'startDate', 'endDate', 'homeCurrency', 'foreignCurrency', 'rate'],
    json: [],
    dates: ['startDate', 'endDate'],
    times: [],
  },
  plans: { fields: ['id', 'tripId', 'name', 'kind', 'basedOnPlanId'], json: [], dates: [], times: [] },
  items: {
    fields: [
      'id', 'planId', 'date', 'startTime', 'title', 'guide',
      'notes', 'links', 'costs',
      'category', 'paymentMethodId',
    ],
    json: ['notes', 'links', 'costs'],
    dates: ['date'],
    times: ['startTime'],
  },
  reviews: { fields: ['id', 'itemId', 'author', 'text'], json: [], dates: [], times: [] },
  notes: {
    fields: ['id', 'tripId', 'title', 'blocks', 'links'],
    json: ['blocks', 'links'],
    dates: [],
    times: [],
  },
  payments: {
    fields: ['id', 'tripId', 'name', 'owner', 'kind', 'enabled', 'currency', 'rules', 'note'],
    json: ['rules'],
    dates: [],
    times: [],
  },
  transports: {
    fields: ['id', 'tripId', 'name', 'lines'],
    json: ['lines'],
    dates: [],
    times: [],
  },
}

/** 每列都帶的同步欄位。syncedAt 由伺服器蓋章，用來做增量拉取，不受各裝置時鐘誤差影響。 */
var SYNC_FIELDS = ['updatedAt', 'updatedBy', 'deleted', 'syncedAt']


/**
 * 早期版本建立的試算表沒把日期／時間欄設成純文字，
 * 於是「2026-10-31」「08:00」被 Sheets 吃成日期／時間值。
 * 讀取端雖然會還原，但存進去的資料是髒的，這裡會在新版後端第一次 pull/push 時修好，
 * 用帶版本的 _meta 旗標記住，修復規則升級時仍能重新執行。
 */
function repairTextColumnsOnce(ss) {
  var meta = ss.getSheetByName('_meta')
  var rows = meta.getDataRange().getValues()
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === TEXT_COLUMNS_REPAIR_KEY) return

  var tz = ss.getSpreadsheetTimeZone()
  Object.keys(SCHEMA).forEach(function (name) {
    var spec = SCHEMA[name]
    var cols = spec.dates.concat(spec.times)
    if (!cols.length) return
    var sheet = ss.getSheetByName(name)
    if (!sheet) return

    var lastRow = sheet.getLastRow()
    var header = sheet.getDataRange().getValues()[0]

    cols.forEach(function (field) {
      var column = header.indexOf(field) + 1
      if (column <= 0) return
      var isTime = spec.times.indexOf(field) >= 0

      // 只改格式救不了既有資料：舊儲存格裡是 Date 物件，得先轉成字串再寫回去。
      if (lastRow > 1) {
        var range = sheet.getRange(2, column, lastRow - 1, 1)
        var values = range.getValues()
        var fixed = values.map(function (r) {
          var v = r[0]
          if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
            return [Utilities.formatDate(v, tz, isTime ? 'HH:mm' : 'yyyy-MM-dd')]
          }
          return [v === null || v === undefined ? '' : String(v)]
        })
        sheet.getRange(2, column, sheet.getMaxRows() - 1, 1).setNumberFormat('@')
        range.setValues(fixed)
      } else {
        sheet.getRange(2, column, sheet.getMaxRows() - 1, 1).setNumberFormat('@')
      }
    })
  })

  meta.appendRow([TEXT_COLUMNS_REPAIR_KEY, '1'])
}

/**
 * Sheets 可能把看似日期／時間的字串自動轉型。每次寫入都先把「實際目標列」設為純文字，
 * 再以 setValues 寫入，不能只依賴建立試算表時設定整欄，也不能用 appendRow 略過這層保護。
 */
function writeRecordRow(sheet, header, spec, row, line) {
  if (row > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows())
  }

  spec.dates.concat(spec.times).forEach(function (field) {
    var column = header.indexOf(field) + 1
    if (column > 0) sheet.getRange(row, column).setNumberFormat('@')
  })

  sheet.getRange(row, 1, 1, line.length).setValues([line])
}

/**
 * 用瀏覽器直接打開部署網址就會看到版本與時間，
 * 不必透過 App 就能確認「這個網址現在跑的是哪一版」。
 * 部署 Apps Script 最容易出錯的就是改了卻沒建立新版本，這是最快的驗證方式。
 */
function doGet() {
  return json({
    ok: true,
    version: BACKEND_VERSION,
    now: new Date().toISOString(),
    timeZone: Session.getScriptTimeZone(),
  })
}

function doPost(e) {
  var body = {}
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return json({ error: 'bad request' })
  }

  try {
    switch (body.action) {
      case 'create':
        return json(createTrip(body))
      case 'folderInfo':
        return json(folderInfo(body))
      case 'pull':
        return json(pull(body))
      case 'push':
        return json(push(body))
      case 'expandUrl':
        return json(expandUrl(body))
      case 'ping':
        return json({ ok: true, version: BACKEND_VERSION })
      default:
        return json({ error: 'unknown action' })
    }
  } catch (err) {
    return json({ error: String(err) })
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/**
 * 所有旅程的共同上層。指定了 folderId 就用它，否則用根目錄的「旅遊資料」（找不到就建）。
 */
function baseFolder(folderId) {
  if (folderId) return DriveApp.getFolderById(folderId)
  var found = DriveApp.getFoldersByName(FOLDER_NAME)
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME)
}

/** 每趟旅程自己一個資料夾，用旅程名稱命名，之後照片、匯出檔都放得進去。 */
function tripFolder(base, name) {
  var existing = base.getFoldersByName(name)
  return existing.hasNext() ? existing.next() : base.createFolder(name)
}

/** 讓 App 能先確認資料夾存在、並把完整路徑顯示出來，避免建到不知道哪去。 */
function folderInfo(body) {
  var f = baseFolder(body.folderId)
  var parts = [f.getName()]
  var parents = f.getParents()
  var guard = 0
  while (parents.hasNext() && guard < 20) {
    var parent = parents.next()
    parts.unshift(parent.getName())
    parents = parent.getParents()
    guard++
  }
  return { id: f.getId(), name: f.getName(), path: parts.join(' / ') }
}

function createTrip(body) {
  var name = body.name || '未命名旅程'
  var ss = SpreadsheetApp.create(name)
  var file = DriveApp.getFileById(ss.getId())
  var dir = tripFolder(baseFolder(body.folderId), name)
  dir.addFile(file)
  DriveApp.getRootFolder().removeFile(file)

  Object.keys(SCHEMA).forEach(function (name) {
    var spec = SCHEMA[name]
    var sheet = ss.insertSheet(name)
    var header = spec.fields.concat(SYNC_FIELDS)
    sheet.appendRow(header)
    sheet.setFrozenRows(1)

    // 新試算表一開始就把日期與時間欄設成純文字，寫入 YYYY-MM-DD / HH:mm 時不讓 Sheets 猜型別。
    spec.dates.concat(spec.times).forEach(function (field) {
      var column = header.indexOf(field) + 1
      if (column > 0) sheet.getRange(2, column, sheet.getMaxRows() - 1, 1).setNumberFormat('@')
    })
  })

  var meta = ss.insertSheet('_meta')
  meta.appendRow(['key', 'value'])
  meta.appendRow(['schemaVersion', '1'])
  meta.appendRow(['secret', body.secret])

  ss.deleteSheet(ss.getSheetByName('工作表1') || ss.getSheets()[0])
  return { sheetId: ss.getId(), folderId: dir.getId() }
}

/** 旅程改名後，雲端硬碟裡的資料夾與試算表跟著改，免得日後在硬碟裡認不出來。 */
function renameToMatch(ss, name) {
  if (!name) return
  if (ss.getName() !== name) ss.rename(name)
  var parents = DriveApp.getFileById(ss.getId()).getParents()
  if (parents.hasNext()) {
    var dir = parents.next()
    if (dir.getName() !== name && dir.getName() !== FOLDER_NAME) dir.setName(name)
  }
}

function openChecked(body) {
  var ss = SpreadsheetApp.openById(body.sheetId)
  var meta = ss.getSheetByName('_meta').getDataRange().getValues()
  var secret = ''
  for (var i = 0; i < meta.length; i++) if (meta[i][0] === 'secret') secret = String(meta[i][1])
  if (!secret || secret !== String(body.secret)) throw new Error('密鑰不符')
  return ss
}

function readSheet(ss, name, since) {
  var spec = SCHEMA[name]
  var sheet = ss.getSheetByName(name)
  if (!sheet) return []
  var values = sheet.getDataRange().getValues()
  if (values.length < 2) return []

  var header = values[0]
  var out = []
  for (var r = 1; r < values.length; r++) {
    var row = values[r]
    var rec = {}
    for (var c = 0; c < header.length; c++) {
      var key = header[c]
      var value = row[c]
      if (value instanceof Date && !isNaN(value.getTime()) && spec.dates.indexOf(key) >= 0) {
        value = Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
      } else if (value instanceof Date && !isNaN(value.getTime()) && spec.times.indexOf(key) >= 0) {
        value = Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), 'HH:mm')
      } else if (spec.json.indexOf(key) >= 0) {
        try {
          value = value ? JSON.parse(value) : []
        } catch (err) {
          value = []
        }
      }
      rec[key] = value
    }
    if (!rec.id) continue
    if (since && Number(rec.syncedAt) <= Number(since)) continue
    rec.deleted = rec.deleted === true || rec.deleted === 'TRUE' || rec.deleted === 'true'
    out.push(rec)
  }
  return out
}

function pull(body) {
  // 與 push 共用鎖，避免拉取七個分頁的途中被另一台裝置寫入，拿到半新半舊的快照。
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var ss = openChecked(body)
    // 修復也掛在 pull：push 只有本機有變更時才會呼叫，只掛 push 等於大多數情況都不會執行。
    repairTextColumnsOnce(ss)
    var records = {}
    Object.keys(SCHEMA).forEach(function (name) {
      records[name] = readSheet(ss, name, body.since)
    })
    return { now: Date.now(), records: records }
  } finally {
    lock.releaseLock()
  }
}

/**
 * 以 id 為鍵覆寫或新增。用 LockService 序列化，避免兩個人同時推送時互相蓋掉。
 * 伺服器也比較 updatedAt，較舊的離線資料晚到時不能把雲端較新的版本蓋回去。
 */
function push(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var ss = openChecked(body)
    repairTextColumnsOnce(ss)
    var now = Date.now()
    var applied = 0
    var rejected = 0

    Object.keys(SCHEMA).forEach(function (name) {
      var incoming = (body.records && body.records[name]) || []
      if (!incoming.length) return

      var spec = SCHEMA[name]
      var sheet = ss.getSheetByName(name)
      var values = sheet.getDataRange().getValues()
      var header = values[0]
      var updatedAtColumn = header.indexOf('updatedAt')

      var rowById = {}
      for (var i = 1; i < values.length; i++) if (values[i][0]) rowById[values[i][0]] = i + 1

      incoming.forEach(function (rec) {
        var row = rowById[rec.id]
        if (row) {
          var currentUpdatedAt = Number(values[row - 1][updatedAtColumn]) || 0
          var incomingUpdatedAt = Number(rec.updatedAt) || 0
          if (incomingUpdatedAt < currentUpdatedAt) {
            rejected++
            return
          }
        }

        rec.syncedAt = now
        var line = header.map(function (key) {
          var v = rec[key]
          if (v === undefined || v === null) return ''
          if (spec.json.indexOf(key) >= 0) return JSON.stringify(v)
          if (spec.dates.indexOf(key) >= 0 || spec.times.indexOf(key) >= 0) return String(v)
          return v
        })
        if (row) {
          writeRecordRow(sheet, header, spec, row, line)
          values[row - 1] = line
        } else {
          row = sheet.getLastRow() + 1
          writeRecordRow(sheet, header, spec, row, line)
          rowById[rec.id] = row
          values.push(line)
        }
        if (name === 'trips' && !rec.deleted) renameToMatch(ss, rec.name)
        applied++
      })
    })

    return { now: now, applied: applied, rejected: rejected }
  } finally {
    lock.releaseLock()
  }
}

/**
 * 短網址（maps.app.goo.gl）的地名藏在重新導向之後，瀏覽器因同源政策讀不到，
 * 但這支程式跑在 Google 伺服器上，沒有這個限制。
 */
function expandUrl(body) {
  var res = UrlFetchApp.fetch(body.url, { followRedirects: false, muteHttpExceptions: true })
  var target = res.getHeaders()['Location'] || res.getHeaders()['location'] || body.url
  var label = ''
  var m = String(target).match(/\/maps\/place\/([^\/@]+)/)
  if (m && m[1]) label = decodeURIComponent(m[1].replace(/\+/g, ' '))
  return { url: target, label: label }
}
