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

var FOLDER_NAME = 'TravelApp'

/** 每個分頁的欄位。JSON_FIELDS 裡的欄位以 JSON 字串存進單一儲存格。 */
var SCHEMA = {
  trips: {
    fields: ['id', 'name', 'startDate', 'endDate', 'homeCurrency', 'foreignCurrency', 'rate'],
    json: [],
  },
  plans: { fields: ['id', 'tripId', 'name', 'kind', 'basedOnPlanId'], json: [] },
  items: {
    fields: [
      'id', 'planId', 'date', 'startTime', 'title', 'guide',
      'notes', 'links', 'costs',
      'category', 'paymentMethodId', 'paymentStatus', 'chargeDate',
    ],
    json: ['notes', 'links', 'costs'],
  },
  reviews: { fields: ['id', 'itemId', 'author', 'text'], json: [] },
  notes: { fields: ['id', 'tripId', 'title', 'blocks', 'links'], json: ['blocks', 'links'] },
  payments: {
    fields: ['id', 'tripId', 'name', 'owner', 'kind', 'enabled', 'currency', 'rules', 'note'],
    json: ['rules'],
  },
  transports: { fields: ['id', 'tripId', 'name', 'lines'], json: ['lines'] },
}

/** 每列都帶的同步欄位。syncedAt 由伺服器蓋章，用來做增量拉取，不受各裝置時鐘誤差影響。 */
var SYNC_FIELDS = ['updatedAt', 'updatedBy', 'deleted', 'syncedAt']

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
        return json({ ok: true })
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
 * 指定了 folderId 就放那裡，沒指定就用雲端硬碟根目錄的 TravelApp 資料夾（找不到就建一個）。
 */
function folder(folderId) {
  if (folderId) return DriveApp.getFolderById(folderId)
  var found = DriveApp.getFoldersByName(FOLDER_NAME)
  return found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME)
}

/** 讓 App 能先確認資料夾存在、並把完整路徑顯示出來，避免建到不知道哪去。 */
function folderInfo(body) {
  var f = folder(body.folderId)
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
  var ss = SpreadsheetApp.create(body.name || '未命名旅程')
  var file = DriveApp.getFileById(ss.getId())
  folder(body.folderId).addFile(file)
  DriveApp.getRootFolder().removeFile(file)

  Object.keys(SCHEMA).forEach(function (name) {
    var sheet = ss.insertSheet(name)
    sheet.appendRow(SCHEMA[name].fields.concat(SYNC_FIELDS))
    sheet.setFrozenRows(1)
  })

  var meta = ss.insertSheet('_meta')
  meta.appendRow(['key', 'value'])
  meta.appendRow(['schemaVersion', '1'])
  meta.appendRow(['secret', body.secret])

  ss.deleteSheet(ss.getSheetByName('工作表1') || ss.getSheets()[0])
  return { sheetId: ss.getId() }
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
      if (spec.json.indexOf(key) >= 0) {
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
  var ss = openChecked(body)
  var records = {}
  Object.keys(SCHEMA).forEach(function (name) {
    records[name] = readSheet(ss, name, body.since)
  })
  return { now: Date.now(), records: records }
}

/**
 * 以 id 為鍵覆寫或新增。用 LockService 序列化，避免兩個人同時推送時互相蓋掉。
 * 衝突由客戶端依 updatedAt 判定，這裡只忠實寫入它送來的內容。
 */
function push(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var ss = openChecked(body)
    var now = Date.now()
    var applied = 0

    Object.keys(SCHEMA).forEach(function (name) {
      var incoming = (body.records && body.records[name]) || []
      if (!incoming.length) return

      var spec = SCHEMA[name]
      var sheet = ss.getSheetByName(name)
      var header = sheet.getDataRange().getValues()[0]
      var ids = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow() - 1), 1).getValues()

      var rowById = {}
      for (var i = 0; i < ids.length; i++) if (ids[i][0]) rowById[ids[i][0]] = i + 2

      incoming.forEach(function (rec) {
        rec.syncedAt = now
        var line = header.map(function (key) {
          var v = rec[key]
          if (v === undefined || v === null) return ''
          if (spec.json.indexOf(key) >= 0) return JSON.stringify(v)
          return v
        })
        var row = rowById[rec.id]
        if (row) sheet.getRange(row, 1, 1, line.length).setValues([line])
        else sheet.appendRow(line)
        applied++
      })
    })

    return { now: now, applied: applied }
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
