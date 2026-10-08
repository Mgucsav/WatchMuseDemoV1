# WatchMuse

WatchMuse; filmler hakkında paylaşım yapmayı, birlikte film seçmeyi ve kişisel
bir film kütüphanesi tutmayı aynı uygulamada birleştiren Next.js tabanlı bir
film topluluğudur.

## Çalışan demo

**[WatchMuse canlı demosunu aç](https://watch-muse-demo-v1.vercel.app/)**

| Bölüm | Adres |
| --- | --- |
| Tanıtım | [watch-muse-demo-v1.vercel.app](https://watch-muse-demo-v1.vercel.app/) |
| Sosyal akış | [/akis](https://watch-muse-demo-v1.vercel.app/akis) |
| Film arama | [/ara](https://watch-muse-demo-v1.vercel.app/ara) |
| Kişisel kütüphane | [/kutuphanem](https://watch-muse-demo-v1.vercel.app/kutuphanem) |
| Film karar odaları | [/rooms](https://watch-muse-demo-v1.vercel.app/rooms) |
| Hesap ve mesajlar | [/hesabim](https://watch-muse-demo-v1.vercel.app/hesabim) |

## Güncel özellikler

### Sosyal film akışı

- Kayıtlı üyeler film odaklı veya serbest gönderi paylaşabilir.
- Gönderiye TMDb aramasıyla film ve afiş eklenebilir.
- Gönderilere tek seviyeli cevap yazılabilir.
- Gönderiler ve cevaplar beğenilebilir veya repost edilebilir.
- Akış iki sekmedir: **Genel** ve **Takip ettiklerin** (takip edilenlerin
  gönderileri, onların repostları ve kendi gönderilerin).
- Her sekme üç şekilde sıralanır:
  - **Hot:** Reddit'in sıralaması. `log10(etkileşim) + paylaşım zamanı / 45000 sn`;
    etkileşim = beğeni + 2 × repost + cevap. Yeni ve ilgi gören gönderiler üstte.
  - **Popüler:** Son 30 günün en çok etkileşim alan gönderileri.
  - **Yeni:** Kronolojik; repost edilen gönderi yeniden üste çıkar.
- Seçili sekme adres çubuğunda tutulur (`/akis?kapsam=takip&sirala=top`).

### Takip ve profil sayfaları

- Kayıtlı üyeler birbirini tek yönlü takip edebilir; takip, arkadaşlıktan
  bağımsızdır.
- Her kullanıcı adının herkese açık bir profili vardır: `/u/<kullanıcı adı>`.
  Kapak fotoğrafı, profil fotoğrafı, görünen ad, bio, katılma tarihi, takip /
  takipçi / paylaşım sayıları ve "Seni takip ediyor" etiketi gösterilir.
- Profil sekmeleri: Paylaşımlar, Takipçiler, Takip edilenler. **Beğeniler**
  sekmesi yalnız profilin sahibine görünür; başkalarının beğenileri gizlidir.
- Akıştaki yazar adları ve arkadaş listesindeki isimler profile bağlanır.
- **Hesabım** (`/hesabim`) sekmeleri: Profilim (kendi profil görünümün),
  Profili düzenle, Arkadaşlar, Mesajlar. `?sekme=duzenle|arkadaslar|mesajlar`
  ile doğrudan açılabilir.

### Sosyal hesaplar

- Her kayıtlı üye benzersiz bir kullanıcı adı, görünen ad ve 300 karakterlik
  profil açıklaması belirleyebilir.
- JPG, PNG veya WebP profil ve kapak fotoğrafları en fazla 5 MB olacak şekilde
  Supabase Storage'a yüklenir (`profile-avatars`, `profile-banners`). Kapak
  3:1 oranında gösterilir; en iyi sonuç için 1500×500.
- Üyeler kullanıcı adı veya görünen adla birbirini arayabilir; arkadaşlık isteği
  gönderebilir, kabul/reddedebilir ve bağlantıyı kaldırabilir.
- Özel mesajlar sohbet geçmişi ve okunmamış mesaj sayısıyla birlikte gösterilir.
- DM gizliliği `Herkes`, `Yalnızca arkadaşlarım` veya `Hiç kimse` olarak
  kişiselleştirilebilir.
- Repost edilen içerik yeniden ana akışın üstüne çıkar.
- Kayıtlı kullanıcı kendi gönderisini veya cevabını silebilir. Ana gönderi
  silindiğinde ona bağlı cevaplar, beğeniler ve repostlar da temizlenir.
- Anonim ziyaretçiler akışı ve cevapları okuyabilir.
- Paylaşma, cevaplama, beğenme ve repost yalnızca kalıcı hesaplara açıktır.
- Üyelik kontrolü arayüzün yanında PostgreSQL fonksiyonlarında da uygulanır.

### Film arama ve platform kontrolü

- TMDb üzerinden Türkçe film araması yapılır.
- Türkçe ve orijinal başlık, afiş, yıl, özet ve puan gösterilir.
- Türkiye için Netflix, Prime Video, Apple TV+, Disney+, BluTV ve MUBI
  uygunluğu kontrol edilir.
- Platform bilgileri TMDb aracılığıyla JustWatch verisinden gelir.

### Kişisel kütüphane

- Anonim kullanıcılar hesap açmadan film kaydetmeye başlayabilir.
- Filmler `İzlenecek` veya `İzlendi` olarak işaretlenebilir.
- İzlenen filmlere 1–10 puan ve kişisel not eklenebilir.
- Anonim kimlik daha sonra e-posta/şifre hesabına bağlanır; mevcut veriler
  taşınmadan aynı kullanıcı kimliğinde kalır.

### Public ve private film odaları

- Odalar 2–20 kişilik kapasiteyle kurulabilir.
- Public odaları yalnız üyeler oluşturabilir ve public odalara yalnız üyeler
  doğrudan katılabilir.
- Private odalar listede görünür; üyeler veya anonim kullanıcılar oda sahibinin
  belirlediği şifreyle katılır.
- Private oda şifreleri açık metin olarak değil, salt'lı `scrypt` özeti olarak
  saklanır.
- Oda sahibi katılımcı çıkarabilir, kullanıcıyı yeniden girişten menedebilir ve
  odayı kapatabilir.
- Misafir odadan çıkabilir; oda sayfasını kapattığında veya sayfadan ayrıldığında
  otomatik olarak odadan çıkar. Film/Teleparty için başka sekmeye geçmek üyeliği
  sonlandırmaz.

### Oda sohbeti ve ortak film seçimi

- Oda katılımcıları kendi aralarında mesajlaşabilir.
- Sohbet beş mesajlık sabit görünüm ve dahili kaydırma kullanır.
- `Enter` mesajı gönderir, `Shift + Enter` yeni satır açar.
- Oda oluştururken `Rastgele seçim (çark)` veya `Belirlenmiş film oturumu`
  yöntemi seçilir ve bu tercih oda boyunca korunur.
- Film adayları bütün katılımcıların ortak aboneliklerinden üretilir.
- Her katılımcının `Geç`, `Belki` ve `İsterim` oyu gizlidir.
- Herkes tamamladığında ortak adaylar açılır.
- Çark kazananı sunucuda bir kez belirlenir ve bütün ekranlarda aynı sonuç
  gösterilir.
- Belirlenmiş film odasında host TMDb kataloğundan filmi arayıp doğrudan oturum
  başlatır. Film, bütün katılımcıların ortak aboneliklerinden en az birinde
  bulunmalıdır.
- Doğrudan seçilen film de mevcut hazır olma, kişisel kütüphane ve Teleparty
  akışını kullanır.

### Teleparty köprüsü

- Herkes seçilen filmi kabul ettiğinde Teleparty hazırlık aşaması açılır.
- Oda sahibi filmi desteklenen platformda açıp Teleparty URL'sini kopyalar.
- WatchMuse bağlantıyı panodan alır ve diğer katılımcılara `Teleparty'ye katıl`
  düğmesini gösterir.
- Teleparty eklentisinin kendi güvenlik sınırları nedeniyle oturum tamamen
  otomatik oluşturulmaz.

## Teknoloji

- Next.js 16.3 App Router
- React 19
- TypeScript
- Tailwind CSS 4 (renk token'larıyla)
- Supabase Auth ve PostgreSQL
- Vercel
- TMDb API
- Vitest ve ESLint

## Yerel kurulum

Gereksinimler:

- Güncel Node.js LTS
- Bir TMDb Read Access Token
- Kalıcı sosyal akış, hesap, kütüphane ve oda özellikleri için Supabase projesi

```bash
npm install
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

`.env.local`:

```dotenv
TMDB_ACCESS_TOKEN=your_tmdb_read_access_token_here
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ardından:

```bash
npm run dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde açılır.

### Anahtarsız film demosu

Yalnız arama arayüzünü deterministik örnek veriyle çalıştırmak için:

```dotenv
TMDB_ACCESS_TOKEN=DEMO
```

Sosyal akış, kalıcı hesap/kütüphane ve eşzamanlı oda özellikleri Supabase
gerektirir.

## Supabase kurulumu

1. Supabase projesi oluşturun.
2. **Authentication → Providers → Anonymous sign-ins** seçeneğini açın.
3. E-posta hesabı için Email provider, Manual Linking ve uygulamanın Redirect
   URL ayarlarını yapın.
4. `supabase/migrations/` altındaki migration'ları dosya adına göre sırayla
   uygulayın:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

5. Yukarıdaki environment değişkenlerini hem yerel ortamda hem Vercel projesinde
   tanımlayın.

`SUPABASE_SERVICE_ROLE_KEY` yalnız sunucuda kullanılmalıdır. Değişken adına
`NEXT_PUBLIC_` eklenmemeli ve anahtar hiçbir zaman Git'e gönderilmemelidir.

Ayrıntılı hesap kurulumu için
[AUTH_AND_LIBRARY_SETUP.md](AUTH_AND_LIBRARY_SETUP.md), oda/tur kurulumu için
[ROOM_SELECTION_AND_WHEEL_SETUP.md](ROOM_SELECTION_AND_WHEEL_SETUP.md)
belgelerine bakabilirsiniz.

## Komutlar

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

## Güvenlik modeli

| Kural | Uygulama |
| --- | --- |
| TMDb token'ı istemciye verilmez | TMDb istemcisi `server-only` modüllerde çalışır |
| Service-role anahtarı tarayıcıya verilmez | Yalnız güvenilen sunucu işlemlerinde kullanılır |
| Private oda şifresi açık saklanmaz | Rastgele salt ve `scrypt` özeti ayrı, istemciye kapalı tabloda tutulur |
| Davet token'ı açık saklanmaz | Veritabanına yalnız SHA-256 özeti yazılır |
| Oda yazmaları doğrudan tabloya yapılmaz | Yetki, kapasite ve rol kontrolleri `SECURITY DEFINER` RPC'lerde uygulanır |
| Sosyal yazmalar üyelik gerektirir | PostgreSQL, `auth.users.is_anonymous` değerini her yazmada kontrol eder |
| Sosyal akış kimlik sızdırmaz | Okuma RPC'si e-posta ve `user_id` döndürmez |
| Profiller kullanıcı adıyla açılır | Profil, takip ve takipçi RPC'leri `user_id` döndürmez; anonim hesapların profili yoktur |
| Beğeniler gizlidir | `list_profile_posts` beğenileri yalnız profil sahibine döndürür |
| Takip yalnız üyelere açıktır | `toggle_follow` kalıcı üyeliği ve kendini takip etmemeyi veritabanında doğrular |
| DM gizliliği istemcide aşılamaz | Alıcının tercihi ve arkadaşlık durumu mesaj RPC'sinde yeniden doğrulanır |
| Avatar yüklemeleri sınırlandırılır | Sunucu dosya boyutunu, MIME türünü ve dosya imzasını doğrular |
| Beğeni ve repost tekildir | `primary key (post_id, user_id)` ile garanti edilir |
| Kütüphane yalnız sahibine aittir | RLS işlemleri `auth.uid()` ile sınırlar |
| Gizli oda oyları doğrudan okunamaz | İstemci yalnız kendi oylarını ve tamamlanan ortak sonucu görür |
| Çark sonucu ortak ve değişmezdir | Kazanan sunucuda bir kez seçilip zaman damgasıyla saklanır |
| Hata ayrıntıları dışarı sızmaz | Ham SQL ve iç hata mesajları sabit alan hatalarına çevrilir |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` istemci için tasarlanmış yayınlanabilir
anahtardır; tek başına yetki sağlamaz. Yetkiyi RLS ve güvenli RPC'ler belirler.

`.env.local` Git tarafından yok sayılır.

## Tasarım sistemi

Arayüz **retro siyah** bir temadır: siyah zemin, ince çizgiler, gölgesiz
yüzeyler ve iki marka rengi, **kırmızı** ve **yeşil**. Kırmızı markayı (logodaki
"W", "MUSE" ve şeritler) ve başlıklardaki vurgu kelimelerini, yeşil ana
eylemleri ve seçili durumu (ana düğme, sol paneldeki açık bölüm) taşır. Hata, uyarı ve platform
uygunluğu kendi durum renklerini kullanmaya devam eder.

Site her zaman koyu temada açılır: `<html class="dark">` ve globals.css'teki
`@custom-variant dark` sayesinde `dark:` sınıfları işletim sistemi tercihinden
bağımsız uygulanır. Sınıf kaldırılırsa açık tema değerleri hâlâ tanımlıdır.

### Düzen

- **Tanıtım sayfası (`/`):** Siteye girenler önce WatchMuse'un ne olduğunu ve
  dört bölümü özetleyen kısa bir ekran görür; "Akışa gir" ile `/akis`'e geçer.
- **Sol panel:** Logo, bölümler (Akış, Ara, Kütüphanem, Odalar, Hesabım) ve
  hesap alanı. Açık bölüm yeşil çizgiyle işaretlenir. Hesap alanından profil
  fotoğrafı, görünen ad, kullanıcı adı ve açıklama `/hesabim` sayfasında
  düzenlenir. Telefonda panel üstte yatay bir çubuğa dönüşür.
- Tanıtım ve giriş sayfaları kendi tam ekran düzenlerini kullanır; sol panel
  orada gösterilmez ([SidebarVisibility.tsx](src/components/SidebarVisibility.tsx)).
- Girişten sonra varsayılan hedef `/akis`'tir.

### Logo

Marka yalnız kırmızı ve beyaz kullanır; yeşil logoda yer almaz.
[src/components/brand/Logo.tsx](src/components/brand/Logo.tsx) iki bileşen
sunar:

- `LogoMark`: logo, beyaz gölgeli büyük kırmızı bir "W". Sol panelin
  üstünde durur; tarayıcı sekmesi simgesi aynı çizimin siyah zemin üzerindeki
  kopyasıdır: [src/app/icon.svg](src/app/icon.svg).
- `Wordmark`: sinema afişi yazı tipiyle (Bebas Neue) "WATCHMUSE"; WATCH beyaz,
  MUSE kırmızı, altında kırmızı-beyaz retro şeritler
  (`size="sm" | "md" | "lg"`). Tanıtım ve giriş sayfalarının sol üstünde
  durur; bu sayfalarda "W" gösterilmez.

### Renk token'ları

Bütün renkler [src/app/globals.css](src/app/globals.css) içinde CSS değişkeni
olarak tanımlıdır: açık tema değerleri `:root` içinde, koyu tema değerleri
`.dark` içindedir. `@theme inline` bloğu her token'ı Tailwind'e
`--color-<isim>` olarak tanıtır; böylece token'lar normal renk sınıfı gibi
kullanılır. Retro başlıklar için `font-display` (Bebas Neue) sınıfı vardır.

```tsx
// Önce
<p className="text-black/60 dark:text-white/60">…</p>
<button className="bg-black text-white dark:bg-white dark:text-black">Paylaş</button>

// Sonra
<p className="text-ink-60">…</p>
<button className="bg-fill-inverse text-on-inverse">Paylaş</button>
```

| Grup | Sınıf örneği | Token'lar ve kullanım |
| --- | --- | --- |
| Marka | `text-brand-green`, `bg-brand-red` | `brand-green` (#3ccf6e, siyah zeminde 9.7:1), `brand-red` (#e8423f, 4.9:1). İki temada aynı |
| Sayfa | `bg-wm-background`, `text-wm-foreground` | `wm-background`, `wm-foreground`, `wm-accent` (bağlantılar), `wm-muted` |
| Metin | `text-ink-60` | `ink-75` … `ink-40`. Hiyerarşi renkle değil saydamlıkla kurulur: `ink-60` açıklama ve meta, `ink-55` zaman damgası, `ink-50` etiket ve ipucu |
| Çizgi | `border-line-10` | `line-10` kart ve bölüm, `line-15` tür etiketi, `line-20` kontrol kenarı, `line-30` güçlü çerçeve, `line-focus` odaklı input (`focus:border-line-focus`), `line-selected` seçili satır |
| Dolgu | `hover:bg-fill-hover` | `fill-subtle`, `fill-hover`, `fill-selected`, `fill-placeholder` (afiş yer tutucu), `fill-badge` |
| Ana düğme | `bg-fill-inverse text-on-inverse` | Koyu temada marka yeşili üzerine siyah yazı (açık temada siyah). Her görünümde tek dolgulu düğme bulunur |
| Örtü | `bg-scrim` | `scrim` modal arkası, `scrim-control` görsel üstündeki kapatma düğmesi (iki temada aynı) |
| Hata | `text-error-ink` | `error-ink` satır içi hata ve silme düğmesi, `error-line`, StatusMessage için `error-surface`, `error-border`, `error-text` |
| Uyarı | `bg-warning-surface` | `warning-surface`, `warning-border`, `warning-text` |
| Platform rozetleri | `bg-success-badge text-success-badge-text` | `success-badge` “Aboneliğe dahil”, `unknown-badge` “Bilgi mevcut değil”, `fill-badge` + `ink-70` “Bulunamadı”. Rozetler her zaman kelimeyle birlikte gösterilir; anlam yalnız renge bırakılmaz |

Kurallar:

- Yeni kodda `black`/`white` + `dark:` çifti yazmayın; karşılık gelen token
  sınıfını kullanın.
- Gereken renk listede yoksa token'ı üç yere ekleyin: `:root` (açık değer),
  `.dark` (koyu değer, iki temada aynıysa gerekmez) ve `@theme inline`
  (`--color-<isim>: var(--<isim>);`).
- Bağlantılar için global `a` kuralı Tailwind'in `base` katmanındadır; bir
  bağlantıda `no-underline` veya `text-*` sınıfları bu kuralı ezer.
- Boşluk, köşe yarıçapı ve yazı boyutları Tailwind'in varsayılan ölçeğini
  kullanır; bunlar için ayrı token yoktur.
- Tek seferlik değerler bilinçli olarak sınıf olarak kalır: oda çarkının
  halkaları, afiş üstündeki gradyan, avatar yer tutucusu, seçili oda seçeneği
  ve abonelik seçicisindeki vurgu.

## Proje yapısı

```text
src/
├── app/
│   ├── api/feed/             sosyal akış, cevap, beğeni ve repost uçları
│   ├── api/movies/           TMDb arama, detay ve platform uçları
│   ├── api/rooms/            oda, sohbet, tur, seçim ve Teleparty uçları
│   ├── ara/                  film arama ekranı
│   ├── kutuphanem/           kişisel kütüphane
│   ├── rooms/                oda listesi, oluşturma ve oda ekranı
│   ├── akis/                 ana sosyal akış
│   ├── api/profiles/         profil, paylaşım/beğeni, takip ve takipçi uçları
│   ├── giris/                giriş sayfası
│   ├── u/[username]/         herkese açık profil sayfası
│   ├── globals.css           renk token'ları ve global stiller
│   └── page.tsx              tanıtım sayfası
├── components/
│   ├── social/               sosyal akış, gönderi listesi ve gönderi oluşturucu
│   ├── profile/              profil görünümü ve takipçi listeleri
│   ├── rooms/                oda, sohbet, tur ve Teleparty arayüzleri
│   ├── library/              kütüphane bileşenleri
│   ├── auth/                 oturum ve hesap bileşenleri
│   ├── brand/                logo
│   └── SiteSidebar.tsx       sol panel
├── lib/
│   ├── social/               sosyal servis, doğrulama ve tipler
│   ├── rooms/                oda alan mantığı ve güvenli servisler
│   ├── library/              kütüphane servisi
│   ├── tmdb/                 TMDb istemcisi ve normalizasyon
│   ├── auth/                 doğrulanmış kullanıcı DAL'i
│   └── supabase/             tarayıcı, kullanıcı ve admin istemcileri
└── proxy.ts                  Supabase oturum tazeleme

supabase/migrations/          sıralı PostgreSQL migration'ları
```

İstek akışı:

```text
Tarayıcı → Next.js Route Handler → server-only servis → Supabase RPC → PostgreSQL
```

Route handler'lar girdi doğrulaması ve HTTP hata eşlemesi yapar. Yetki ve temel
iş kuralları veri kaynağına en yakın katmanda tekrar doğrulanır.

## Bilinen sınırlamalar

- Sosyal cevaplar şu anda tek seviyelidir.
- Sosyal akış ve profil listeleri ilk 30, cevaplar ve takipçi listeleri ilk 50
  kayıtla sınırlıdır; sonsuz kaydırma yoktur.
- Hot ve Popüler sıralaması sorgu anında hesaplanır; gönderi sayısı çok
  büyürse önceden hesaplanmış bir puan sütununa geçmek gerekir.
- Kullanıcı engelleme, içerik raporlama ve moderasyon paneli henüz yoktur.
- DM'lerde dosya/görsel gönderimi, mesaj silme ve uçtan uca şifreleme henüz yoktur.
- Oda ve sohbet güncellemeleri Supabase Realtime yerine kontrollü polling
  kullanır.
- Teleparty oturumunun oluşturulması tarayıcı eklentisi nedeniyle yarı
  otomatiktir.
- TMDb araması yalnız ilk sonuç sayfasını getirir.
- Yerel oda deposu geliştirme içindir ve süreç yeniden başlayınca silinir.
- Film platformu satırlarındaki marka renkli sol çizgi koyu temada görünmez:
  `dark:border-white/15` bu çizginin rengini ezer. Görünümü değiştirmemek için
  bu satır henüz token sınıfına çevrilmedi.

## Test durumu

Güncel kod tabanında TypeScript, ESLint, production build ve Vitest kontrolleri
çalıştırılır. SQL migration sözleşmeleri de test paketinin parçasıdır.

## Atıf

Bu ürün TMDb API'sini kullanır ancak TMDb tarafından onaylanmamış veya
sertifikalandırılmamıştır. Yayın platformu bilgileri TMDb aracılığıyla
JustWatch kaynağından gelir ve platformların kataloglarıyla tamamen eşzamanlı
olmayabilir.
