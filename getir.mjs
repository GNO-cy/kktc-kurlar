// KKTC MERKEZ BANKASI KUR AYNASI - bağımlılıksız (Node >= 20).
//
// KKTCMB'nin "o gün geçerli resmî kur" XML'ini (kur/tarih/YYYYMMDD) HİÇ
// DEĞİŞTİRMEDEN kktcmb/YYYY/YYYYMMDD.xml olarak saklar. Dosya adı İSTENEN
// gündür: hafta sonu/tatil isteğine KKTCMB kapsayan duyuruyu döndürür.
// GO Accounting (src/modules/kur/kurAynasi.js) bu dosyaları CORS'a açık
// raw.githubusercontent.com adresinden okur.
//
//   node getir.mjs                      # dün, bugün, yarın (varsayılan)
//   node getir.mjs --gun 2026-09-28     # tek gün
//   node getir.mjs --gecmis 2024-01-01  # o günden yarına kadar, EKSİK günler
//
// Kurallar:
//  - Yalnız <KKTCMB_Doviz_Kurlari> kökü olan yanıt yazılır. "Seçtiğiniz tarihe
//    ait döviz kurları bulunamadı!" HTML'i (gelecek gün) yayımlanmamış sayılır;
//    başka her yanıt hatadır (09.04.2011 öncesinde XML yok, o günler hata görünür).
//  - Var olan dosya aynıysa dokunulmaz; FARKLIYSA üzerine yazılır ve günlüğe
//    "DEĞİŞTİ" basılır (git geçmişi eski içeriği korur).
//  - İstekler arası 1,5 sn (kamu sunucusuna nazik davran).
//  - Resmî adres mb.gov.ct.tr; yedek kktcmerkezbankasi.org. `www.mb.gov.ct.tr`
//    TLS hatası veriyor (sertifika yalnız mb.gov.ct.tr), kullanılmaz.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KOK = path.dirname(fileURLToPath(import.meta.url))
// 02/11/2026: GitHub'ın ABD'deki koşucusu 28/10'dan beri bankaya bağlanamıyor (UND_ERR_CONNECT_TIMEOUT;
// site Avrupa ve Türkiye'den açılıyor, ABD'den açılmıyor). Actions'ta ilk kaynak bu yüzden GO ERP'nin
// europe-west1'deki kktcmbKur aracısı: yalnız Bearer anahtarla ve ?gun=YYYYMMDD için bankanın dosyasını
// baytı baytına döner (go-erp deposu functions/kktcmbKurAyna.js). Anahtar Actions secret'ı KUR_AYNA_ANAHTAR;
// yalnız aracıya gönderilir, hiçbir yere yazılmaz. Anahtar yoksa (yerelde elle koşu) ya da aracı düşerse
// banka adresleri doğrudan denenir (KKTC'den açılır).
const ANAHTAR = (process.env.KUR_AYNA_ANAHTAR || '').trim()
const ARACI = 'https://europe-west1-go-erp-e79a4.cloudfunctions.net/kktcmbKur?gun='
const KAYNAKLAR = [...(ANAHTAR ? [ARACI] : []), 'https://mb.gov.ct.tr/kur/tarih/', 'https://www.kktcmerkezbankasi.org/kur/tarih/']
const UA = 'kktc-kurlar-aynasi (+https://github.com/GNO-cy/kktc-kurlar)'
const ISTEK_SURESI_MS = 60000               // aracının soğuk başlangıcı + iki banka denemesi buna sığar
const BEKLE_MS = 1500
const bekle = ms => new Promise(r => setTimeout(r, ms))

// KKTC saati (UTC+3, yaz saati yok) ile bugün.
function kktcBugun(fark = 0) {
  return new Date(Date.now() + 3 * 3600e3 + fark * 86400e3).toISOString().slice(0, 10)
}
function gunler(bas, bit) {
  const out = []
  for (let t = Date.parse(`${bas}T00:00:00Z`); t <= Date.parse(`${bit}T00:00:00Z`); t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
const dosyaYolu = iso => path.join(KOK, 'kktcmb', iso.slice(0, 4), iso.replaceAll('-', '') + '.xml')

async function cek(iso) {
  const ad = iso.replaceAll('-', '')
  const hatalar = []
  for (const kok of KAYNAKLAR) {
    try {
      const basliklar = { 'User-Agent': UA }
      if (kok === ARACI) basliklar.Authorization = `Bearer ${ANAHTAR}`
      const r = await fetch(kok + ad, { headers: basliklar, signal: AbortSignal.timeout(ISTEK_SURESI_MS) })
      const metin = await r.text()
      if (!r.ok) { hatalar.push(`${kok}: HTTP ${r.status} ${metin.slice(0, 120).replace(/\s+/g, ' ')}`); continue }
      if (!/<KKTCMB_Doviz_Kurlari[\s>]/.test(metin)) {
        // Yalnız bankanın kendi "Seçtiğiniz tarihe ait döviz kurları bulunamadı!" sayfası yayımlanmamış sayılır;
        // başka bir 200 sayfası (engel, bakım) hatadır, yoksa iş yeşil kalıp dosyalar sessizce eskirdi.
        if (/kurlar\S* bulunamad/.test(metin)) return { yok: true }
        hatalar.push(`${kok}: beklenmeyen sayfa ${metin.slice(0, 120).replace(/\s+/g, ' ')}`); continue
      }
      if (!/<Kur_Tarihi>\d{2}\/\d{2}\/\d{4}<\/Kur_Tarihi>/.test(metin)) { hatalar.push(`${kok}: Kur_Tarihi yok`); continue }
      return { metin }
    } catch (e) { hatalar.push(`${kok}: ${e?.cause?.code || e?.name || 'hata'}`) }   // message değil: geçersiz başlık hatası anahtarı içerebilir
  }
  return { hata: hatalar.join(' | ') }
}

async function isle(liste, { yalnizEksik }) {
  let yeni = 0, degisti = 0, ayni = 0, yok = 0, hata = 0
  for (const [i, iso] of liste.entries()) {
    const yol = dosyaYolu(iso)
    const eski = await readFile(yol, 'utf8').catch(() => null)
    if (yalnizEksik && eski != null) continue
    if (i) await bekle(BEKLE_MS)
    const s = await cek(iso)
    if (s.yok) { yok++; console.log(`${iso} yayımlanmamış`); continue }
    if (s.hata) { hata++; console.error(`${iso} HATA ${s.hata}`); continue }
    if (eski === s.metin) { ayni++; continue }
    await mkdir(path.dirname(yol), { recursive: true })
    await writeFile(yol, s.metin)
    if (eski == null) { yeni++; console.log(`${iso} yeni`) } else { degisti++; console.log(`${iso} DEĞİŞTİ (önceki içerik git geçmişinde)`) }
  }
  console.log(`özet: ${yeni} yeni, ${degisti} değişti, ${ayni} aynı, ${yok} yayımlanmamış, ${hata} hata`)
  // Hepsi hataysa iş kırmızı düşsün (sessiz bozulma yok); tek tük hata günlükte kalır.
  if (hata && !yeni && !degisti && !ayni && !yok) process.exit(1)
}

const arg = process.argv.slice(2)
const deger = ad => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : null }
const gun = deger('--gun'), gecmis = deger('--gecmis')
const tarihMi = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
if (gun && !tarihMi(gun)) { console.error('--gun YYYY-AA-GG'); process.exit(2) }
if (gecmis && !tarihMi(gecmis)) { console.error('--gecmis YYYY-AA-GG'); process.exit(2) }

if (gun) await isle([gun], { yalnizEksik: false })
else if (gecmis) await isle(gunler(gecmis, kktcBugun(1)), { yalnizEksik: true })
else await isle([kktcBugun(-1), kktcBugun(0), kktcBugun(1)], { yalnizEksik: false })
