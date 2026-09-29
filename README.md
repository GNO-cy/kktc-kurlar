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

Yayımlanmamış gün (gelecek, 09.04.2011 öncesi) yazılmaz. Bütün istekler hata
verirse iş kırmızı düşer.

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

⚠️ **Açık soru:** GitHub'ın koşucu IP'lerinin KKTCMB tarafından engellenip
engellenmediği ilk koşuda görülecek. Engellenirse iş kırmızı düşer; o zaman
aynı betik başka bir zamanlanmış ortamdan (ör. her gün açık bir makine)
çalıştırılabilir.
