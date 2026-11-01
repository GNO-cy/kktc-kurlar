# KKTC Merkez Bankası kur aynası

KKTC Merkez Bankası'nın günlük resmî döviz kurları XML'inin **değiştirilmemiş**
kopyaları. Dosyalar `kktcmb/YYYY/YYYYMMDD.xml`: o gün **geçerli** olan duyuru
(hafta sonu ve tatil günleri, kapsayan duyuruyu taşır; geçerlilik aralığı
dosyanın içindedir).

Kaynak: `https://mb.gov.ct.tr/kur/tarih/YYYYMMDD` (KKTCMB "Döviz Kurlarına
Erişim" sayfasında yayımlanan uç). Yedek: `www.kktcmerkezbankasi.org`.

## Neden var

KKTCMB'nin XML ucu tarayıcıdan okunamıyor (CORS başlığı yok,
`Cross-Origin-Resource-Policy: same-origin`). GO Accounting tarayıcıda çalışan
bir uygulama ve sunucu tarafı yok. Bu depo, zamanlanmış bir GitHub Actions işiyle
dosyaları çekip CORS'a açık `raw.githubusercontent.com` üzerinden sunar.
Uygulama dosyayı KKTCMB'ninkiyle aynı ayrıştırıcıdan geçirir ve kullanıcı
önizleyip onaylamadan hiçbir kur kaydedilmez.

**28/10/2026'dan beri** banka sitesi GitHub'ın ABD'deki koşucusundan gelen
bağlantıyı cevaplamıyor (Avrupa ve Türkiye'den açılıyor). Actions'ta `getir.mjs`
önce GO ERP'nin Belçika'daki (europe-west1) `kktcmbKur` aracısını dener: aracı
yalnız Bearer anahtarla ve `?gun=YYYYMMDD` için bankanın dosyasını baytı baytına
döner (go-erp deposu `functions/kktcmbKurAyna.js`). Anahtar Actions secret'ı
`KUR_AYNA_ANAHTAR`; kodda yalnız SHA-256 özeti durur. Anahtar yoksa ya da aracı
düşerse banka adresleri doğrudan denenir. Aracı en çok 3 gün ilerisini verir.

Bu bir **taşıyıcıdır, kaynak değildir**: içerik bayt bayt KKTCMB'nin
yanıtıdır. Bir dosya sonradan değişirse (KKTCMB bir duyuruyu düzeltirse) yeni
içerik yazılır, eskisi git geçmişinde kalır.

## Çalışma

- `.github/workflows/kurlar.yml`: günde üç kez (05:10, 16:40, 20:30 UTC) dün,
  bugün ve yarın. KKTCMB ertesi günün kurunu akşam yayımlar.
- Elle: Actions > kurlar > Run workflow. `gecmis` alanına bir tarih yazılırsa
  o günden bugüne **eksik** günler doldurulur (istekler arası 1,5 sn).
- Yerelde: `node getir.mjs`, `node getir.mjs --gun 2026-09-28`,
  `node getir.mjs --gecmis 2024-01-01`. Bağımlılık yok, Node 20+.

Yayımlanmamış gün (gelecek) yazılmaz; yalnız bankanın "bulunamadı" sayfası
böyle sayılır, başka bir sayfa hatadır (09.04.2011 öncesinde XML yok, o günler
hata görünür). Bütün istekler hata verirse iş kırmızı düşer.

## Kurulum (bir kez)

Bu klasör GO Accounting deposunda `tools/kur-aynasi/` altında tutulur ve
herkese açık `GNO-cy/kktc-kurlar` deposuna kopyalanır:

```sh
gh repo create GNO-cy/kktc-kurlar --public --description "KKTC Merkez Bankası günlük kur XML aynası"
cp -R tools/kur-aynasi/. /tmp/kktc-kurlar/ && cd /tmp/kktc-kurlar
git init -b main && git add . && git commit -m "Kur aynası" && git remote add origin git@github.com:GNO-cy/kktc-kurlar.git && git push -u origin main
# Settings > Actions > General > Workflow permissions: "Read and write" (commit için)
# Sonra Actions > kurlar > Run workflow, gecmis = 2024-01-01 (ilk doldurma)
```

**Yanıtlanan soru:** GitHub'ın koşucusu 28/10/2026'dan beri KKTCMB'ye
bağlanamıyor; çözüm yukarıdaki aracı. Anahtarı değiştirmek (anahtar komut
satırına yazılmaz, satır sonu olmadan dosyada durur):
`openssl rand -hex 32 | tr -d '\n' > f`, özet `shasum -a 256 < f`,
`gh secret set KUR_AYNA_ANAHTAR --repo GNO-cy/kktc-kurlar < f`, sonra `rm f`.
Özeti `functions/kktcmbKurAyna.js`'teki `ANAHTAR_OZETI`'ne koy ve yalnız
`kktcmbKur` fonksiyonunu yayınla.
