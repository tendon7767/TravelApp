/**
 * 通路標籤（大國藥妝、BIC CAMERA…）沒有獨立的同步集合，規則裡存的就是名字本身，
 * 所以比對時一律先正規化：全形轉半形、去頭尾空白、忽略大小寫。
 *
 * 存進資料的永遠是使用者打的那個樣子，只有比對與去重用這支 —— 畫面上要看到自己打的字。
 */
export const channelKey = (name: string): string =>
  name.normalize('NFKC').trim().toLowerCase()

/** 兩個標籤是不是同一個。 */
export const sameChannel = (a: string, b: string): boolean => channelKey(a) === channelKey(b)
