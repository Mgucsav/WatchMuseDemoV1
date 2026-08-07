# WatchMuse — Film Abonelik Kontrolü (Demo)

WatchMuse, bir film arayıp o filmin **Türkiye kataloğunda** Netflix veya Amazon Prime
Video aboneliğine dahil olup olmadığını gösteren mobil uyumlu demo uygulamadır.

Bu depo projenin **ilk teknik altyapısı**dır; görsel tasarım WatchMuse markasına
uygun retro siyah-beyaz bir estetik ile hazırlanmıştır. Uygulama ilerleyen
adımlarda production'a taşınabilir.

## Veri kuralı

Uygulama çalışma zamanında **hiçbir sahte, örnek veya mock film verisi
kullanmaz**. Tüm film ve sağlayıcı sonuçları gerçek TMDb API yanıtlarından
gelir. TMDb'ye ulaşılamadığında uydurma sonuç gösterilmez; kullanıcıya açık bir
Türkçe hata durumu gösterilir.

## Kullanılan teknoloji

| Alan | Seçim |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Dil | TypeScript |
| Stil | Tailwind CSS v4 |
| Lint | ESLint (`eslint-config-next`) |
| Veri kaynağı | TMDb API v3 (v4 read access token ile) |
| Paket yöneticisi | npm |

Veritabanı, authentication, ayrı backend servisi ve deployment yapılandırması
bilinçli olarak yoktur.

Tek ek çalışma zamanı bağımlılığı `server-only`: TMDb erişim katmanının bir
istemci bileşeninden import edilmesi durumunda derlemeyi hata ile durdurur.

## Gereken Node.js sürümü

**Node.js 20 LTS veya üzeri** (geliştirme ve doğrulama Node.js 24 LTS ile
yapılmıştır). Next.js 16 daha eski sürümlerde çalışmaz.

```bash
node --version
```

## Kurulum

```bash
npm install
```

## `.env.local` oluşturma

Token deponun içindeki hiçbir kaynak dosyada bulunmaz. Yerel çalışma için
kendi token'ınızı bir ortam değişkeni dosyasına yazmanız gerekir.

1. Örnek dosyayı kopyalayın:

   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env.local

   # macOS / Linux
   cp .env.example .env.local
   ```

2. https://www.themoviedb.org/settings/api adresine gidin ve
   **"API Read Access Token"** değerini kopyalayın.
   (Bu, kısa "API Key (v3 auth)" değeri değil, uzun olan token'dır.)

3. `.env.local` dosyasını açıp değeri yapıştırın:

   ```
   TMDB_ACCESS_TOKEN=buraya_kendi_tokeniniz
   ```

4. Geliştirme sunucusu çalışıyorsa yeniden başlatın.

### Güvenlik notları

- Değişken adı `TMDB_ACCESS_TOKEN`'dır ve başında **`NEXT_PUBLIC_` yoktur**.
  Bu önek eklenirse token tarayıcıya gönderilir; eklemeyin.
- Token yalnızca sunucuda, `src/lib/tmdb/client.ts` içinde okunur. İstemciye,
  HTML'e veya API yanıtına hiçbir parçası gönderilmez ve loglanmaz.
- `.env.local` `.gitignore` ile Git dışında tutulur. `.env.example` gerçek
  değer içermez ve depoda tutulur.

## Komutlar

```bash
npm run dev        # geliştirme sunucusu — http://localhost:3000
npm run build      # production build
npm run start      # build sonrası production sunucusu
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

`TMDB_ACCESS_TOKEN` tanımlı olmasa bile `npm run build` başarıyla tamamlanır.
Bu durumda API uçları gizli bilgi sızdırmadan bir yapılandırma hatası döner ve
arayüz "TMDb bağlantısı henüz yapılandırılmamış" mesajını gösterir.

## Mimari

```
src/
├─ app/
│  ├─ api/movies/search/route.ts            # GET /api/movies/search?q=
│  ├─ api/movies/[id]/providers/route.ts    # GET /api/movies/<id>/providers
│  ├─ layout.tsx
│  └─ page.tsx                              # doğrulama arayüzü
├─ components/                              # arama ve sonuç bileşenleri
└─ lib/
   ├─ api/                                  # HTTP yanıt yardımcıları (sunucu + istemci)
   ├─ constants.ts                          # ortak sabitler (debounce, min. uzunluk)
   ├─ ttl-cache.ts                          # süreç içi süreli önbellek
   └─ tmdb/
      ├─ client.ts       # server-only HTTP istemcisi, token burada okunur
      ├─ constants.ts    # provider ID'leri, dil, bölge, TTL değerleri
      ├─ normalize.ts    # savunmacı ayrıştırma yardımcıları
      ├─ providers.ts    # watch/providers + TR sınıflandırma
      ├─ search.ts       # search/movie + normalizasyon
      ├─ errors.ts       # hata modeli ve HTTP eşlemesi
      └─ types.ts        # uygulamanın kendi response modelleri
```

TMDb yanıtları hiçbir zaman doğrudan arayüze geçirilmez; her yanıt önce
`types.ts` içindeki tip güvenli modellere normalize edilir.

## Türkiye ve `flatrate` sınıflandırma kuralı

Sağlayıcı bilgisi TMDb'nin `movie/{id}/watch/providers` ucundan alınır.

- Yalnızca **`results.TR`** verisi incelenir; diğer ülkeler tamamen yok sayılır.
- Yalnızca **`flatrate`** listesi "aboneliğe dahil" sayılır.
- **`rent` ve `buy` girişleri yok sayılır.** Bir film Prime Video üzerinden
  kiralanabiliyor olsa bile bu "Prime aboneliğine dahil" anlamına gelmez ve
  uygulama bunu *dahil* olarak işaretlemez.
- Eşleştirme **yalnızca TMDb provider ID'si** üzerinden yapılır. Sağlayıcı
  adında metin/substring araması yapılmaz — "Amazon Video" ile "Amazon Prime
  Video" gibi farklı hizmetlerin karışmasını önlemek için.
- Hedef ID'ler tek merkezde tutulur: `src/lib/tmdb/constants.ts` →
  `TARGET_PROVIDERS`. Reklamlı paket varyantları da aynı aboneliğe dahil kabul
  edilir.

Arayüzdeki üç durum birbirinden ayrılır:

| Durum | Anlamı |
| --- | --- |
| **Aboneliğe dahil** | Platform, TR `flatrate` listesinde ID ile eşleşti |
| **Bulunamadı** | TMDb'de TR kaydı var, ancak bu platform abonelikle sunmuyor |
| **Bilgi mevcut değil** | TMDb'de bu film için hiç TR kaydı yok (hata değildir) |

## API çağrısı davranışı

- Arama en az **2 karakter** girilince başlar.
- Arama alanında **375 ms debounce** uygulanır.
- Her yeni arama, uçuştaki önceki isteği `AbortController` ile iptal eder;
  böylece geç dönen eski bir yanıt yeni sonuçların üzerine yazamaz.
- Sağlayıcı sorgusu **yalnızca kullanıcı bir film seçtiğinde** çalışır. Arama
  listesindeki filmler için toplu sağlayıcı isteği gönderilmez.
- Sağlayıcı sonuçları **6 saat**, arama sonuçları 30 dakika önbelleğe alınır.

Önbellek `src/lib/ttl-cache.ts` içinde süreç içi (in-memory) olarak
uygulanmıştır. Bunun nedeni, TMDb isteklerinin `Authorization` başlığı taşıması
ve Next.js'in fetch data cache'inin bu istekleri güvenilir biçimde
saklamamasıdır; önbellek davranışının öngörülebilir olması tercih edilmiştir.

## Bilinen sınırlamalar

- **Katalog gecikmesi:** TMDb sağlayıcı verisi JustWatch kaynaklıdır ve
  platformların kendi kataloglarıyla **tamamen eşzamanlı olmayabilir**. Bir
  film platformdan yeni çıkmış ya da yeni eklenmiş olabilir. Sonuçlar bilgi
  amaçlıdır; kesin bilgi için platformun kendi uygulamasını kontrol edin.
- **Önbellek kalıcı değildir:** süreç içi tutulur, sunucu yeniden başladığında
  sıfırlanır ve birden fazla sunucu örneği arasında paylaşılmaz.
- Arama yalnızca **ilk sonuç sayfasını** getirir; sayfalama henüz yoktur.
- Otomatik test paketi henüz eklenmemiştir.

## Attribution

Bu ürün TMDb API'sini kullanır, ancak **TMDb tarafından onaylanmamış veya
sertifikalandırılmamıştır**. Film verileri
[The Movie Database (TMDb)](https://www.themoviedb.org/) tarafından sağlanır.

Yayın platformu (watch provider) bilgileri TMDb aracılığıyla
[JustWatch](https://www.justwatch.com/) kaynağından gelmektedir.

Her iki kaynak da uygulama arayüzünde kullanıcıya gösterilir.
