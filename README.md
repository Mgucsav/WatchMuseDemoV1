# WatchMuse

WatchMuse; filmler hakkında paylaşım yapmayı, birlikte film seçmeyi ve kişisel
bir film kütüphanesi tutmayı aynı uygulamada birleştiren Next.js tabanlı bir
film topluluğudur.

## Çalışan demo

**[WatchMuse canlı demosunu aç](https://watch-muse-demo-v1.vercel.app/)**

| Bölüm | Adres |
| --- | --- |
| Sosyal akış | [watch-muse-demo-v1.vercel.app](https://watch-muse-demo-v1.vercel.app/) |
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

### Sosyal hesaplar

- Her kayıtlı üye benzersiz bir kullanıcı adı, görünen ad ve 300 karakterlik
  profil açıklaması belirleyebilir.
- JPG, PNG veya WebP profil fotoğrafları en fazla 5 MB olacak şekilde Supabase
  Storage'a yüklenir.
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
- Tailwind CSS
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
│   └── page.tsx              ana sosyal akış
├── components/
│   ├── social/               sosyal akış ve gönderi oluşturucu
│   ├── rooms/                oda, sohbet, tur ve Teleparty arayüzleri
│   ├── library/              kütüphane bileşenleri
│   └── auth/                 oturum ve hesap bileşenleri
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
- Sosyal akış ilk 30, cevaplar ilk 50 kayıtla sınırlıdır; sonsuz kaydırma yoktur.
- Kullanıcı engelleme, içerik raporlama ve moderasyon paneli henüz yoktur.
- DM'lerde dosya/görsel gönderimi, mesaj silme ve uçtan uca şifreleme henüz yoktur.
- Oda ve sohbet güncellemeleri Supabase Realtime yerine kontrollü polling
  kullanır.
- Teleparty oturumunun oluşturulması tarayıcı eklentisi nedeniyle yarı
  otomatiktir.
- TMDb araması yalnız ilk sonuç sayfasını getirir.
- Yerel oda deposu geliştirme içindir ve süreç yeniden başlayınca silinir.

## Test durumu

Güncel kod tabanında TypeScript, ESLint, production build ve Vitest kontrolleri
çalıştırılır. SQL migration sözleşmeleri de test paketinin parçasıdır.

## Atıf

Bu ürün TMDb API'sini kullanır ancak TMDb tarafından onaylanmamış veya
sertifikalandırılmamıştır. Yayın platformu bilgileri TMDb aracılığıyla
JustWatch kaynağından gelir ve platformların kataloglarıyla tamamen eşzamanlı
olmayabilir.
