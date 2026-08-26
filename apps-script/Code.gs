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
var BACKEND_VERSION = '2026-08-27-receipt-ai'

/** 邀請連結備份的分頁名稱。不在 SCHEMA 裡，pull/push 都不會碰到它。 */
var INVITE_SHEET = '邀請連結'

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
      'notes', 'links', 'costs', 'costGroups',
      'category', 'paymentMethodId', 'sourceItemId', 'stayNight',
    ],
    json: ['notes', 'links', 'costs', 'costGroups'],
    dates: ['date'],
    times: ['startTime'],
  },
  reviews: { fields: ['id', 'itemId', 'author', 'text'], json: [], dates: [], times: [] },
  photos: {
    fields: [
      'id', 'tripId', 'itemId', 'kind',
      'fileId', 'fileUrl', 'thumbnailFileId', 'thumbnailUrl',
      'mimeType', 'width', 'height', 'byteSize',
    ],
    json: [],
    dates: [],
    times: [],
  },
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

/** 舊旅程沒有後來新增的分頁／欄位；每次進入後端時以增量方式補齊。 */
function ensureSchema(ss) {
  Object.keys(SCHEMA).forEach(function (name) {
    var spec = SCHEMA[name]
    var sheet = ss.getSheetByName(name)
    var wanted = spec.fields.concat(SYNC_FIELDS)
    if (!sheet) {
      sheet = ss.insertSheet(name)
      sheet.appendRow(wanted)
      sheet.setFrozenRows(1)
      return
    }
    var lastColumn = Math.max(1, sheet.getLastColumn())
    var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    var missing = wanted.filter(function (field) { return header.indexOf(field) < 0 })
    if (missing.length) sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing])
  })
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
      case 'saveInvite':
        return json(saveInvite(body))
      case 'uploadPhoto':
        return json(uploadPhoto(body))
      case 'describePlace':
        return json(describePlace(body))
      case 'analyzeReceipt':
        return json(analyzeReceipt(body))
      case 'ping':
        return json({
          ok: true,
          version: BACKEND_VERSION,
          capabilities: { photos: 1, invite: 1, ai: 1, costGroups: 1, receiptAi: 1 },
        })
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

/**
 * 把邀請連結留一份在試算表自己的分頁裡。
 *
 * 為什麼需要：手機端的試算表 ID 與密鑰跟旅程資料存在同一個 IndexedDB，瀏覽器清除
 * 儲存空間時是整個 origin 一起清，連回得去雲端的鑰匙也會一併消失。那時使用者手上
 * 唯一還在的東西就是雲端硬碟裡這份試算表，所以連結必須放在打開試算表就看得到的地方。
 *
 * 連結字串由前端算好送上來：後端不知道前端部署在哪個網域，而
 * ScriptApp.getService().getUrl() 拿到的不保證是呼叫端正在用的那個部署。這個值只寫進
 * 儲存格顯示，不參與任何判斷，而且呼叫者本來就得先通過密鑰檢查，偽造它動不了其他資料。
 */
function saveInvite(body) {
  var ss = openChecked(body)
  var url = String(body.inviteUrl || '')
  if (!url) throw new Error('缺少邀請連結')

  var sheet = ss.getSheetByName(INVITE_SHEET)
  if (!sheet) {
    // 放在第一個分頁，打開試算表第一眼就看得到。
    sheet = ss.insertSheet(INVITE_SHEET, 0)
    sheet.setColumnWidth(1, 640)
    sheet.getRange(1, 1, 4, 1).setNumberFormat('@')
  }
  sheet.getRange(1, 1, 4, 1).setValues([
    ['邀請連結（等同這趟的通行證，只給同行的人）'],
    [url],
    ['手機裡的資料被清掉時，把上面那段網址整段貼回 App 的「加入旅程」，就能把這趟拿回來。'],
    ['最後更新：' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')],
  ])
  return { ok: true }
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
    ensureSchema(ss)
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
    ensureSchema(ss)
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
        // 照片檔案只能由 uploadPhoto 建立。一般同步只接受既有照片的刪除墓碑，
        // 否則拿到旅程密鑰的人可以偽造 fileId，讓後端誤刪帳號中的其他 Drive 檔案。
        if (name === 'photos') {
          if (!row || !rec.deleted) {
            rejected++
            return
          }
          var currentPhoto = recordFromValues(header, values[row - 1], spec, ss)
          rec = Object.assign({}, currentPhoto, {
            deleted: true,
            updatedAt: rec.updatedAt,
            updatedBy: rec.updatedBy,
          })
        }
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
        if (name === 'photos' && rec.deleted) trashPhotoFiles(rec)
        applied++
      })
    })

    cascadeDeletedPhotos(ss, now)

    return { now: now, applied: applied, rejected: rejected }
  } finally {
    lock.releaseLock()
  }
}

function recordFromValues(header, row, spec, ss) {
  var rec = {}
  for (var c = 0; c < header.length; c++) {
    var key = header[c]
    var value = row[c]
    if (spec.json.indexOf(key) >= 0) {
      try { value = value ? JSON.parse(value) : [] } catch (err) { value = [] }
    }
    rec[key] = value
  }
  rec.deleted = rec.deleted === true || rec.deleted === 'TRUE' || rec.deleted === 'true'
  return rec
}

function findRecord(ss, name, id) {
  var sheet = ss.getSheetByName(name)
  if (!sheet) return null
  var values = sheet.getDataRange().getValues()
  if (values.length < 2) return null
  var header = values[0]
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      var rec = recordFromValues(header, values[i], SCHEMA[name], ss)
      rec._row = i + 1
      return rec
    }
  }
  return null
}

function childFolder(parent, name) {
  var found = parent.getFoldersByName(name)
  return found.hasNext() ? found.next() : parent.createFolder(name)
}

function photoFolder(ss, kind) {
  var parents = DriveApp.getFileById(ss.getId()).getParents()
  if (!parents.hasNext()) throw new Error('找不到旅程的雲端資料夾')
  return childFolder(childFolder(parents.next(), '照片'), kind === 'receipt' ? '收據' : '行程')
}

function existingFile(folder, name) {
  var files = folder.getFilesByName(name)
  return files.hasNext() ? files.next() : null
}

/**
 * 不能用 file.getDownloadUrl()：那個網址帶臨時存取權杖，換一個瀏覽器或過一陣子就失效，
 * 放進 <img> 只會變破圖。公開網址一律由 fileId 組（前端顯示時也是自己重算，見 src/photos/urls.ts）。
 */
function publicDownloadUrl(file, thumbnail) {
  var id = encodeURIComponent(file.getId())
  return thumbnail
    ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w480&travelapp=thumb'
    : 'https://lh3.googleusercontent.com/d/' + id + '=w2560'
}

function trashFile(id) {
  if (!id) return
  try { DriveApp.getFileById(String(id)).setTrashed(true) } catch (err) {
    // 檔案已刪除或帳號政策改變時，metadata 墓碑仍應成功同步。
  }
}

function trashPhotoFiles(photo) {
  trashFile(photo.fileId)
  trashFile(photo.thumbnailFileId)
}

/**
 * 舊版 App 刪除 Item／Plan 時不知道要一併送照片墓碑；後端每次 push 都補做級聯。
 */
function cascadeDeletedPhotos(ss, now) {
  var plans = readSheet(ss, 'plans', 0)
  var items = readSheet(ss, 'items', 0)
  var activePlans = {}
  var activeItems = {}
  plans.forEach(function (plan) { if (!plan.deleted) activePlans[String(plan.id)] = true })
  items.forEach(function (item) {
    if (!item.deleted && activePlans[String(item.planId)]) activeItems[String(item.id)] = true
  })

  var sheet = ss.getSheetByName('photos')
  var values = sheet.getDataRange().getValues()
  if (values.length < 2) return
  var header = values[0]
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue
    var photo = recordFromValues(header, values[i], SCHEMA.photos, ss)
    if (photo.deleted || activeItems[String(photo.itemId)]) continue
    photo.deleted = true
    photo.updatedAt = now
    photo.updatedBy = '系統'
    photo.syncedAt = now
    var line = header.map(function (key) {
      var value = photo[key]
      return value === undefined || value === null ? '' : value
    })
    writeRecordRow(sheet, header, SCHEMA.photos, i + 1, line)
    trashPhotoFiles(photo)
  }
}

function uploadPhoto(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var ss = openChecked(body)
    ensureSchema(ss)
    var input = body.photo || {}
    if (!input.id || !input.itemId) throw new Error('照片資料不完整')
    if (input.kind !== 'receipt' && input.kind !== 'trip') throw new Error('照片類型不正確')
    if (input.mimeType !== 'image/jpeg') throw new Error('只接受 JPEG 顯示版本')

    var existing = findRecord(ss, 'photos', input.id)
    if (existing) {
      if (existing.deleted) throw new Error('這張照片已刪除')
      delete existing._row
      delete existing.syncedAt
      return existing
    }

    var item = findRecord(ss, 'items', input.itemId)
    var plan = item && findRecord(ss, 'plans', item.planId)
    var trip = plan && findRecord(ss, 'trips', plan.tripId)
    if (!item || item.deleted || !plan || plan.deleted || plan.kind !== 'actual' || !trip || trip.deleted) {
      throw new Error('照片只能上傳到仍存在的實際版行程')
    }

    var fullBytes = Utilities.base64Decode(String(input.fullBase64 || ''))
    var thumbBytes = Utilities.base64Decode(String(input.thumbnailBase64 || ''))
    var fullLimit = input.kind === 'receipt' ? 750 * 1024 : 2 * 1024 * 1024
    if (!fullBytes.length || fullBytes.length > fullLimit) throw new Error('照片檔案超過大小限制')
    if (!thumbBytes.length || thumbBytes.length > 120 * 1024) throw new Error('照片縮圖超過大小限制')
    if (Number(input.byteSize) !== fullBytes.length) throw new Error('照片大小驗證失敗')
    if (!(Number(input.width) > 0) || !(Number(input.height) > 0)) throw new Error('照片尺寸無效')

    var folder = photoFolder(ss, input.kind)
    var fullName = String(input.id) + '.jpg'
    var thumbName = String(input.id) + '-thumb.jpg'
    var fullFile = existingFile(folder, fullName)
    var thumbFile = existingFile(folder, thumbName)
    try {
      if (!fullFile) fullFile = folder.createFile(Utilities.newBlob(fullBytes, 'image/jpeg', fullName))
      if (!thumbFile) thumbFile = folder.createFile(Utilities.newBlob(thumbBytes, 'image/jpeg', thumbName))
      fullFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
      thumbFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

      var now = Date.now()
      var photo = {
        id: String(input.id),
        tripId: String(trip.id),
        itemId: String(item.id),
        kind: input.kind,
        fileId: fullFile.getId(),
        fileUrl: publicDownloadUrl(fullFile, false),
        thumbnailFileId: thumbFile.getId(),
        thumbnailUrl: publicDownloadUrl(thumbFile, true),
        mimeType: 'image/jpeg',
        width: Number(input.width),
        height: Number(input.height),
        byteSize: fullBytes.length,
        updatedAt: Number(input.updatedAt) || now,
        updatedBy: String(input.updatedBy || '同行者'),
        deleted: false,
        syncedAt: now,
      }
      var sheet = ss.getSheetByName('photos')
      var header = sheet.getDataRange().getValues()[0]
      var line = header.map(function (key) {
        var value = photo[key]
        return value === undefined || value === null ? '' : value
      })
      writeRecordRow(sheet, header, SCHEMA.photos, sheet.getLastRow() + 1, line)
      delete photo.syncedAt
      return photo
    } catch (err) {
      if (fullFile) trashFile(fullFile.getId())
      if (thumbFile) trashFile(thumbFile.getId())
      throw new Error('無法建立可分享的照片：' + String(err))
    }
  } finally {
    lock.releaseLock()
  }
}

/** 網頁應用程式公開在網路上，解析網址前要先驗證旅程密鑰，也不能存取本機或私有網段。 */
function checkedPublicUrl(value) {
  var url = String(value || '').trim()
  var match = url.match(/^https?:\/\/([^\/?#]+)/i)
  if (!match) throw new Error('只支援 http 或 https 網址')

  var host = match[1].replace(/:\d+$/, '').toLowerCase()
  if (
    host.indexOf('@') >= 0 ||
    host === 'localhost' ||
    /\.(local|internal)$/.test(host) ||
    /^\[/.test(host) ||
    /^\d+$/.test(host) ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error('不允許解析本機或私有網址')
  }
  return url
}

function redirectUrl(base, location) {
  var target = String(location || '').trim()
  if (/^https?:\/\//i.test(target)) return target
  var origin = String(base).match(/^(https?:\/\/[^\/?#]+)/i)
  if (!origin) return target
  if (/^\/\//.test(target)) return origin[1].split(':')[0] + ':' + target
  if (/^\//.test(target)) return origin[1] + target
  return String(base).replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/') + target
}

function responseHeader(headers, name) {
  var wanted = name.toLowerCase()
  var keys = Object.keys(headers || {})
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) return headers[keys[i]]
  }
  return ''
}

function decodeHtmlText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, function (_, code) {
      return String.fromCharCode(parseInt(code, 16))
    })
    .replace(/&#(\d+);/g, function (_, code) {
      return String.fromCharCode(parseInt(code, 10))
    })
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelFromUrl(url) {
  var place = String(url).match(/\/maps\/place\/([^\/@?#]+)/)
  var query = String(url).match(/[?&](?:destination|query|q)=([^&#]+)/)
  var encoded = place && place[1] ? place[1] : query && query[1] ? query[1] : ''
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/\+/g, ' '))
    } catch (err) {
      return encoded.replace(/\+/g, ' ')
    }
  }
  return ''
}

/** 阻擋頁有時仍回 200；不能把錯誤頁的標題誤當成使用者想收藏的網站名稱。 */
function usablePageTitle(value) {
  var title = String(value || '').trim()
  if (!title) return ''
  var blocked = [
    /系統異常|異常回報|存取遭拒|拒絕存取|機器人驗證/,
    /^\s*(?:403|404|429|500|502|503)\b/,
    /\b(?:access denied|forbidden|service unavailable|too many requests)\b/i,
    /^(?:just a moment|attention required|page not found)\b/i,
    /(?:verify you are human|checking your browser|captcha)/i,
  ]
  for (var i = 0; i < blocked.length; i++) if (blocked[i].test(title)) return ''
  return title
}

/**
 * 手機版 Google Maps 只給短網址；一般網站的標題也因瀏覽器同源政策無法直接讀取。
 * 後端最多追蹤五次重新導向，再從 Maps 網址取地名或從 HTML <title> 取顯示名稱。
 */
/**
 * 地點分析。走 Gemini 的 Interactions API。
 *
 * 金鑰放指令碼屬性（專案設定 → 指令碼屬性），不寫進這份檔案：
 *   GEMINI_API_KEY   必填，去 aistudio.google.com 申請，免費層不必綁信用卡
 *   GEMINI_MODEL     選填，緊急時可以在這裡蓋過前端送來的模型，不必 push
 *   GEMINI_RECEIPT_MODEL 選填，只蓋收據分析模型；留空就用前端指定的 Lite
 *
 * prompt、輸出 schema、模型與工具都由前端隨請求送上來，這裡只負責轉發 ——
 * 那三樣是會反覆調整的東西，留在後端的話每改一次都要走完整的部署流程，
 * 而且忘了部署會靜默失敗（schema 沒有的欄位模型不會產出，也不報錯）。
 *
 * 端點刻意留在後端寫死，不接受前端指定：金鑰是放在標頭裡送去那個網址的，
 * 讓呼叫端決定送去哪，等於任何拿到邀請連結的人都能把金鑰導去自己的伺服器。
 */
var GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
var GEMINI_DEFAULT_MODEL = 'gemini-3.7-flash'
var GEMINI_RECEIPT_DEFAULT_MODEL = 'gemini-3.5-flash-lite'

/** 前端沒送 schema 時的備援（例如同行者的瀏覽器還是舊的快取版本）。 */
var PLACE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    bestfoods: { type: 'array', items: { type: 'string' } },
    bestgoods: { type: 'array', items: { type: 'string' } },
    stayMinutes: { type: 'integer' },
    timing: { type: 'string' },
    nearby: { type: 'string' },
    cautions: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary', 'highlights', 'bestfoods', 'bestgoods',
    'stayMinutes', 'timing', 'nearby', 'cautions',
  ],
}

/** 收據分析的前端 schema 沒送到時仍要維持相同輸出，不能退回自由文字。 */
var RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    currency: { type: 'string' },
    receiptTotal: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          unitPrice: { type: 'number' },
          qty: { type: 'number' },
        },
        required: ['label', 'unitPrice', 'qty'],
      },
    },
  },
  required: ['label', 'currency', 'receiptTotal', 'items'],
}

function describePlace(body) {
  openChecked(body)
  if (!body.prompt || !body.input) return { error: 'bad request' }

  var props = PropertiesService.getScriptProperties()
  var key = props.getProperty('GEMINI_API_KEY')
  if (!key) return { error: '後端沒有設定 GEMINI_API_KEY' }

  // 金鑰走標頭不走網址參數：Apps Script 的執行記錄會留下網址。
  var res = UrlFetchApp.fetch(GEMINI_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      // 指令碼屬性優先，那是不想 push 時的緊急出口；其次才是前端送來的。
      model: props.getProperty('GEMINI_MODEL') || body.model || GEMINI_DEFAULT_MODEL,
      system_instruction: String(body.prompt).slice(0, 8000),
      input: String(body.input).slice(0, 8000),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: body.schema || PLACE_SCHEMA,
      },
      // 搜尋工具。前端沒送就是不開，整個欄位不出現。
      tools: body.tools && body.tools.length ? body.tools : undefined,
    }),
  })

  var code = res.getResponseCode()
  var text = res.getContentText()
  if (code < 200 || code >= 300) return { error: geminiError(code, text) }

  var payload
  try {
    payload = JSON.parse(text)
  } catch (err) {
    return { error: 'Gemini 的回應不是 JSON' }
  }

  var output = interactionText(payload)
  if (!output) return { error: 'Gemini 沒有回傳內容' }
  var place = parsePlaceJson(output)
  if (!place) return { error: '分析結果的格式不對' }
  return { ok: true, place: place }
}

/**
 * 收據影像分析。圖片由前端壓成 JPEG 後直接送進這次請求，不寫入 Drive。
 * GEMINI_RECEIPT_MODEL 與地點分析分開，避免既有的 GEMINI_MODEL 把 OCR 拉去昂貴模型。
 */
function analyzeReceipt(body) {
  openChecked(body)
  var image = body.image || {}
  var imageData = String(image.data || '')
  if (!body.prompt || !body.input || image.mimeType !== 'image/jpeg' || !imageData) {
    return { error: 'bad request' }
  }
  if (imageData.length > 1500000) return { error: '收據圖片太大' }

  var props = PropertiesService.getScriptProperties()
  var key = props.getProperty('GEMINI_API_KEY')
  if (!key) return { error: '後端沒有設定 GEMINI_API_KEY' }

  var res = UrlFetchApp.fetch(GEMINI_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      model:
        props.getProperty('GEMINI_RECEIPT_MODEL') ||
        body.model ||
        GEMINI_RECEIPT_DEFAULT_MODEL,
      system_instruction: String(body.prompt).slice(0, 8000),
      input: [
        { type: 'image', mime_type: 'image/jpeg', data: imageData },
        { type: 'text', text: String(body.input).slice(0, 8000) },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: body.schema || RECEIPT_SCHEMA,
      },
      generation_config: { thinking_level: 'minimal', max_output_tokens: 4096 },
      // 收據可能含有個人消費資訊；這次不需要延續對話，不留互動記錄。
      store: false,
    }),
  })

  var code = res.getResponseCode()
  var text = res.getContentText()
  if (code < 200 || code >= 300) return { error: geminiError(code, text) }

  var payload
  try {
    payload = JSON.parse(text)
  } catch (err) {
    return { error: 'Gemini 的回應不是 JSON' }
  }

  var output = interactionText(payload)
  if (!output) return { error: 'Gemini 沒有回傳內容' }
  var receipt = parsePlaceJson(output)
  if (!receipt) return { error: '收據分析結果的格式不對' }
  return { ok: true, receipt: receipt }
}

/**
 * 開著搜尋時模型偶爾會在 JSON 前後多吐一段文字（已知的 grounding 行為）。
 * 直接 parse 失敗就從第一個 { 到最後一個 } 再撈一次，撈不到才算失敗。
 */
function parsePlaceJson(text) {
  try {
    return JSON.parse(text)
  } catch (err) {}
  var start = text.indexOf('{')
  var end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    return null
  }
}

/**
 * 把 Google 回的錯誤原文帶出來，不要自己編一句安慰話。
 *
 * 429 有兩種完全不同的意思：真的送太快（等一下就好），以及這個配額本來就是零
 * （例如免費層不開放某個功能）—— 後者等再久都不會好。兩者的差別只寫在
 * quotaId 裡（常常直接帶著 FreeTier 或功能名稱），吞掉的話就永遠分不出來。
 */
function geminiError(code, text) {
  var detail = ''
  var quota = ''
  try {
    var body = JSON.parse(text)
    if (body && body.error) {
      detail = String(body.error.message || '')
      var details = body.error.details || []
      for (var i = 0; i < details.length; i++) {
        var violations = details[i].violations || []
        for (var j = 0; j < violations.length; j++) {
          if (violations[j].quotaId) quota = String(violations[j].quotaId)
        }
      }
    }
  } catch (err) {
    detail = String(text).slice(0, 300)
  }

  var prefix = code === 429 ? '配額或速率被擋（429）' : 'Gemini 回應 ' + code
  return [prefix, quota && ('配額：' + quota), detail].filter(Boolean).join(' · ').slice(0, 400)
}

/** 從最後一段模型輸出把文字接起來。中間可能夾著別種 step，所以由後往前找。 */
function interactionText(payload) {
  var steps = (payload && payload.steps) || []
  for (var i = steps.length - 1; i >= 0; i--) {
    var content = steps[i].content || []
    var parts = []
    for (var j = 0; j < content.length; j++) {
      if (content[j].type === 'text' && content[j].text) parts.push(content[j].text)
    }
    if (parts.length) return parts.join('')
  }
  return ''
}

function expandUrl(body) {
  openChecked(body)
  var current = checkedPublicUrl(body.url)
  var response = null

  for (var i = 0; i < 5; i++) {
    response = UrlFetchApp.fetch(current, {
      followRedirects: false,
      muteHttpExceptions: true,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 TravelApp Link Preview',
      },
    })
    var code = response.getResponseCode()
    var location = responseHeader(response.getHeaders(), 'location')
    if (code < 300 || code >= 400 || !location) break
    current = checkedPublicUrl(redirectUrl(current, location))
  }

  var label = labelFromUrl(current)
  var responseCode = response ? response.getResponseCode() : 0
  if (!label && response && responseCode >= 200 && responseCode < 300) {
    try {
      var html = response.getContentText().slice(0, 200000)
      var title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      if (title && title[1]) label = usablePageTitle(decodeHtmlText(title[1]))
    } catch (err) {
      // 有些網址回傳的不是文字；仍回傳已展開的網址，前端會使用原本的備援標籤。
    }
  }
  return { url: current, label: label }
}
