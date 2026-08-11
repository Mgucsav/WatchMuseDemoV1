# WatchMuse

İki kişinin birlikte film seçmesi için tasarlanmış web uygulaması.

Bugün çalışan iki şey var:

1. **Film arama** — TMDb üzerinden gerçek film araması; seçilen filmin Türkiye'de
   Netflix veya Amazon Prime Video aboneliğine dahil olup olmadığını gösterir.
2. **Oda oluşturma** — iki kişilik özel oda, tek kullanımlık davet bağlantısı ve
   partnerin katılmasını bekleyen oda ekranı.

Oylama, rulet ve listeler henüz yok; nereye ekleneceği [aşağıda](#sonraki-adımlar-nereye-eklenir)
anlatılıyor.

---

## Hızlı başlangıç (anahtarsız)

Hiçbir API anahtarı olmadan çalıştırabilirsiniz:

```bash
npm install
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
```

`.env.local` içinde tek satır bırakın:

```
TMDB_ACCESS_TOKEN=DEMO
```

```bash
npm run dev
```

→ http://localhost:3000

**DEMO modunda:** film araması deterministik örnek veri döndürür ve TMDb'ye
hiçbir ağ isteği yapılmaz. Oda akışı da Supabase gerekmeden, süreç içi bir
depoyla çalışır. Demo göstermek veya geliştirme yapmak için yeterlidir.

## Gerçek veriyle çalıştırma

### TMDb

[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) →
**API Read Access Token** (kısa "API Key (v3 auth)" değil; doğru değer `eyJ`
ile başlar ve iki nokta içerir).

```
TMDB_ACCESS_TOKEN=eyJhbGciOi...
```

### Supabase (oda kalıcılığı için)

Supabase yapılandırılmazsa odalar **süreç belleğinde** tutulur ve sunucu yeniden
başlayınca kaybolur. Kalıcı odalar için:

1. Supabase projesi oluşturun.
2. **Authentication → Providers → Anonymous sign-ins: ENABLED** *(varsayılan
   kapalıdır; açılmazsa oda oluşturma çalışmaz)*
3. Migration'ları sırayla uygulayın:
   ```bash
   supabase link --project-ref <proje-ref>
   supabase db push
   ```
4. `.env.local` içine ekleyin:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<proje-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable anahtar>
   ```

Ayrıntı ve doğrulama sorguları: [`docs/ROOMS_ARCHITECTURE.md`](docs/ROOMS_ARCHITECTURE.md)

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm test           # birim testler (Vitest)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm run build      # production build
```

---

## Veri güvenliği

Bu proje birkaç kuralı **yapısal olarak** uygular; yeni özellik eklerken
bunları bozmayın:

| Kural | Nasıl uygulanıyor |
| --- | --- |
| TMDb token'ı tarayıcıya sızmaz | Tek okuma noktası `src/lib/tmdb/client.ts`, `import "server-only"` ile korunuyor — istemciden import edilirse **build kırılır** |
| Davet token'ı veritabanına yazılmaz | Sunucu SHA-256 hesaplar; veritabanına yalnızca hash gider |
| Davet hash'i istemciye verilmez | `invitations` tablosunda **hiç RLS politikası yok** |
| Kullanıcı kendini odaya ekleyemez | Tabloların INSERT/UPDATE politikası yok; yazma yalnızca `SECURITY DEFINER` fonksiyonlardan |
| Odada en fazla iki kişi | `unique(space_id, role)` + iki değerli enum — veritabanı seviyesinde garanti |
| Hata mesajları sır sızdırmaz | Mesajlar daima sabit sözlükten üretilir, ham SQL/token asla yankılanmaz |
| Log sızıntısı yok | Kod tabanında `console.*` çağrısı yok |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` bilinçli olarak herkese açıktır — tek başına
yetki vermez, erişimi RLS belirler. **`service_role` anahtarı bu projede hiç
kullanılmaz ve eklenmemelidir.**

`.env.local` asla commit edilmez (`.gitignore`).

---

## Türkçe / İngilizce arama

Arama **tek ve sabit dille** (`tr-TR`) yapılır.

TMDb'nin eşleştirmesi filmin tüm başlık çevirileri üzerinde çalışır; `language`
parametresi hangi filmlerin bulunacağını değil, dönen başlığın dilini belirler.
Bu yüzden "Inception" da "Başlangıç" da aynı TMDb kaydına ulaşır ve aynı şekilde
gösterilir. Türkçe çevirisi olmayan filmlerde TMDb orijinal başlığı döndürür;
ayrıca orijinal ad arayüzde ayrıca gösterilir.

> Daha önce sorgudaki Türkçe karakterlere bakıp iki ayrı dille iki istek atan
> bir mantık vardı. Aynı filmi sorguya göre farklı başlıkla gösteriyor ve
> sonuçsuz her aramada TMDb kotasını ikiye katlıyordu; kaldırıldı.

---

## Yapı

```
src/
├── app/
│   ├── api/movies/…        film arama + sağlayıcı uçları
│   ├── api/rooms/…         oda oluşturma / katılma / durum
│   ├── rooms/              oda oluşturma ve bekleme ekranı
│   └── invite/[token]/     davet tüketme sayfası
├── components/
│   ├── MovieSearch.tsx …   arama arayüzü
│   └── rooms/              oda arayüzü
├── lib/
│   ├── tmdb/               TMDb istemcisi, normalizasyon, tipler
│   ├── rooms/              oda alan mantığı
│   │   ├── backend.ts      Supabase mi yerel depo mu — TEK karar noktası
│   │   ├── service.ts      sunucu-only oda servisi
│   │   ├── localStore.ts   geliştirme için süreç içi depo
│   │   └── tokens.ts       davet token üretimi + hash
│   ├── supabase/           env doğrulama, tarayıcı/sunucu istemcileri
│   └── validation.ts       girdi doğrulama
└── proxy.ts                Supabase oturum tazeleme

supabase/migrations/        sıralı SQL migration'ları
docs/ROOMS_ARCHITECTURE.md  güven sınırları, RLS, davet akışı
```

### Katmanlar

```
Tarayıcı → API route → oda servisi → (Supabase RPC | yerel depo) → veri
```

API route'lar ince tutulur: girdi doğrulama, servis çağrısı, hata → HTTP eşlemesi.
İş mantığı `src/lib/` içindedir.

---

## Sonraki adımlar: nereye eklenir

Planlanan özellikler ve doğal yerleri:

| Özellik | Nereye |
| --- | --- |
| **Aday film havuzu** (oda kurulunca rastgele öneriler) | Yeni tablo `candidates` + migration; `src/lib/rooms/candidates.ts`; `/api/rooms/[spaceId]/candidates` |
| **Gizli oylama** (birbirini görmeden) | Tablo `votes(space_id, user_id, movie_id, vote)` + `unique(space_id,user_id,movie_id)`; RLS: kullanıcı **yalnızca kendi oyunu** okur/yazar — partnerin oyu ancak ikisi de tamamlayınca açılır |
| **Rulet** | Eşleşen filmler üzerinden seçim; rastgeleliği **sunucuda** üretin (istemciye bırakmayın), sonucu tabloya yazın ki iki taraf aynı sonucu görsün |
| **Ortak izlenenler listesi** | Tablo `watched(space_id, movie_id, watched_at)` |
| **Kişisel puanlar** | Tablo `ratings(user_id, movie_id, score)`; RLS: yalnızca sahibi okur/yazar |

Yeni özellik eklerken:

1. **Migration'ı sıralı ekleyin** (`supabase/migrations/<timestamp>_<ad>.sql`).
2. **RLS'i baştan yazın** — tablo oluşturup politikayı sonraya bırakmayın.
3. **Yazma işlemlerini `SECURITY DEFINER` fonksiyonlara alın**; istemciye
   doğrudan INSERT/UPDATE vermeyin.
4. **Arka uç dallanmasını `backend.ts`'ten sorun** — koşulu kopyalamayın.
5. **Saf mantığı ayrı fonksiyona alın** ve test yazın; testler `*.test.ts`
   olarak kodun yanında durur.

---

## Bilinen sınırlamalar

- **Yerel oda deposu kalıcı değil** — süreç belleğinde; sunucu yeniden başlayınca
  silinir. Sadece geliştirme/demo içindir.
- **Veritabanı davranışları entegrasyon testiyle doğrulanmadı** — RLS, atomiklik
  ve eşzamanlı katılım tasarım incelemesiyle doğrulandı. Kontrol listesi:
  [`docs/ROOMS_ARCHITECTURE.md`](docs/ROOMS_ARCHITECTURE.md) §11
- **Rate limiting yok** — herkese açık dağıtımdan önce eklenmelidir; API uçları
  şu an kimliksiz ve sınırsızdır.
- **Yapılandırılmış log yok** — üretim sorunları teşhis edilemez.
- Arama yalnızca ilk sonuç sayfasını getirir; sayfalama yok.

---

## Atıf

Bu ürün TMDb API'sini kullanır, ancak TMDb tarafından onaylanmamış veya
sertifikalandırılmamıştır. Yayın platformu bilgileri TMDb aracılığıyla JustWatch
kaynağından gelir ve platformların kendi kataloglarıyla tamamen eşzamanlı
olmayabilir.
