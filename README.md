# WatchMuse

İki kişinin birlikte film seçmesi için tasarlanmış web uygulaması.

Bugün çalışan özellikler:

1. **Film arama** — TMDb üzerinden gerçek film araması; seçilen filmin Türkiye'de
   Netflix veya Amazon Prime Video aboneliğine dahil olup olmadığını gösterir.
2. **Ziyaretçi kimliği ve hesap** — herkes doğrudan anonim kimlikle başlar;
   e-posta/şifre, listeyi başka cihazda da kullanmak istediğinde eklenir.
   Giriş, çıkış, e-posta doğrulama ve şifre sıfırlama da vardır.
3. **Kişisel kütüphane** — hesap açmadan izleyeceklerinizi ve izlediklerinizi
   kaydedebilir; izlediğiniz filmlere 1–10 puan ve not ekleyebilirsiniz.
4. **Ortak oda turu** — iki kişilik özel oda, tek kullanımlık davet bağlantısı,
   sunucuda kaydedilen aynı 10 aday, gizli üçlü tercih ve ortak çark sonucu.
   İki taraf da yalnızca kendi oyunu görür; ikisi de bitirince ortak “İzlemek
   isterim” adayları açılır. Çark sonucu sunucuda bir kez belirlenir ve ortak
   zaman damgasıyla iki ekranda aynı anda canlandırılır.

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

**DEMO modunda:** film araması ve oda adayları deterministik örnek veri döndürür;
TMDb'ye hiçbir ağ isteği yapılmaz. Davetle odaya katılma, Supabase olmadan
süreç içi depoyla çalışabilir; **gizli ortak seçim/çark** ise kalıcı ve
eşzamanlı olması gerektiği için Supabase gerektirir.

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

Gizli seçim turu ve ortak çarkı ilk kez açmak için yeni migration ve iki tarayıcı
testi: [`ROOM_SELECTION_AND_WHEEL_SETUP.md`](ROOM_SELECTION_AND_WHEEL_SETUP.md)

### Hesap ve kişisel kütüphane

Ziyaretçi önce anonim Supabase kimliğiyle başlar. Beş film kaydından sonra
“Puanlarını kaydet” çağrısıyla aynı kimliğe e-posta ve şifre bağlayabilir;
veriler taşınmaz. Bunun için **Email provider**, **Manual Linking** ve
**Redirect URL** ayarlanmalıdır. Adım adım kurulum:
[`AUTH_AND_LIBRARY_SETUP.md`](AUTH_AND_LIBRARY_SETUP.md)

Supabase yapılandırılmadan hesap ve kütüphane ekranları açıklayıcı bir mesaj
gösterir; **film arama ve odalar çalışmaya devam eder**.

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
| Kütüphane yalnızca sahibine | `profiles` ve `library_items` üzerinde RLS: kullanıcı yalnızca kendi satırlarını görür/değiştirir |
| Kayıt duvarı yok | Anonim Supabase kimliği önce oluşturulur; e-posta sonradan aynı `auth.uid()` kimliğine bağlanır |
| Oturum doğrulaması tek noktada | `src/lib/auth/dal.ts` — `getUser()` ile Supabase Auth'a doğrulatılır, `getSession()` kullanılmaz |
| Açık yönlendirme koruması | `safeRedirectPath()` yalnızca kendi sitemize ait göreli yollara izin verir |
| Gizli oda oyları | `room_votes` doğrudan okunamaz; API yalnızca kişinin kendi oylarını, tur sonunda da ortak adayları verir |
| Ortak çark sonucu | Kazanan Postgres'te bir kez seçilir, zaman damgasıyla saklanır; istemci sonucu rastgele üretmez |

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
│   ├── auth/callback/      e-posta doğrulama + şifre sıfırlama dönüşü
│   ├── giris/ kayit/       giriş ve klasik kayıt sayfaları
│   ├── hesabini-kaydet/    anonim kimliği kalıcı hesaba bağlama
│   ├── sifre-sifirla/      şifre sıfırlama
│   ├── kutuphanem/         kişisel kütüphane
│   ├── rooms/              oda oluşturma ve bekleme ekranı
│   └── invite/[token]/     davet tüketme sayfası
├── components/
│   ├── MovieSearch.tsx …   arama arayüzü
│   ├── SiteHeader.tsx      üst menü
│   ├── auth/               anonim oturum, giriş/bağlama formları, kullanıcı menüsü
│   ├── library/            kütüphane aksiyonları ve kartları
│   └── rooms/              oda arayüzü
├── lib/
│   ├── auth/               DAL, Server Action'lar, doğrulama
│   ├── library/            kütüphane servisi ve Server Action'ları
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

| Özellik | Nereye |
| --- | --- |
| **Ortak izlenenler listesi** | Tablo `watched(space_id, movie_id, watched_at)` |
| **Ortak oturum sonrası değerlendirme** | Mevcut `library_items` kişisel puan/notu tutar; oda bağlamına özel bir özet gerekiyorsa yeni, RLS'li tablo eklenir |
| **Gerçek zamanlı push** | Şu an 1,2 saniyelik güvenli yoklama var; ileride Supabase Realtime yayını eklenebilir |

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
- **Tur veritabanı testi henüz çalıştırılmadı** — yeni migration, Supabase SQL
  Editor'da uygulandıktan sonra iki tarayıcı oturumuyla doğrulanmalıdır.
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
