# WatchMuse — Güncel Mimari, Kararlar ve Devir Notu

**Tarih:** 12 Ağustos 2026  
**Amaç:** Bu belge, WatchMuse için birlikte alınmış ürün ve teknik kararların,
kurulu dış servislerin, yayımlanmış kodun ve henüz yayımlanmamış öneri taslağının
tek bir güvenli kaydıdır. Yeni bir geliştirici/agent bu dosyayı ilk olarak okumalıdır.

> Bu belgede hiçbir gerçek token, API anahtarı, Supabase proje referansı,
> veritabanı şifresi veya e-posta adresi yoktur. `.env.local` okunmamalı,
> commit edilmemeli ve değeri bu belgeye eklenmemelidir.

---

## 1. Ürün amacı

WatchMuse, iki kişinin birlikte film seçmesini kolaylaştıran bir web uygulamasıdır.
İlk somut ürün döngüsü şöyledir:

1. Kullanıcı film arar; filmin Türkiye'de Netflix veya Prime Video aboneliğine
   dahil olup olmadığını görür.
2. İsterse filmi kişisel izleme listesine ekler; izledikten sonra not ve 1–10
   puan girebilir.
3. Bir kullanıcı iki kişilik özel oda oluşturur ve tek kullanımlık davet
   bağlantısını partnerine yollar.
4. İki kişi aynı sıradaki 10 aday filmi görür ama kararlarını birbirinden gizli
   verir: **İstemiyorum / Belki / İzlemek isterim**.
5. İki taraf da tamamlayınca yalnızca ikisinin de “İzlemek isterim” dediği
   filmler açılır.
6. Ortak filmler arasından sunucunun bir kez seçtiği sonuç, iki ekranda da aynı
   zaman damgasıyla dönen ortak çarkta gösterilir.

Uzun vadeli hedef, oda tercihleri ve kişisel kütüphane geçmişiyle daha iyi aday
havuzu oluşturmaktır. Bu hedef için temel öneri taslağı vardır, fakat henüz canlı
sistemin parçası değildir; ayrıntı için [§14](#14-henüz-canlıya-alınmamış-öneri-taslağı) bölümüne bakın.

---

## 2. Yayımlanmış kaynak kod durumu

| Konu | Değer |
| --- | --- |
| GitHub deposu | `Mgucsav/WatchMuseDemoV1` |
| Production dalı | `main` |
| Canlıya gönderilmiş son commit | `ccce84b` — `feat: add shared room film selection` |
| Önceki yayın commit'i | `f14926e` — `feat: prepare WatchMuse demo for deployment` |
| Canlı Vercel alan adı | `https://watch-muse-demo-v1.vercel.app` |
| Yayımlanmış recommendation taslağı | **Hayır** |

`ccce84b` şunları birlikte içeren bilinçli tek yayın commit'idir:

- anonim kullanıcı + sonradan hesap bağlama akışı,
- kişisel kütüphane,
- güvenli oda ve davet akışı,
- gizli 10-film turu ve ortak çark,
- Supabase migration'ları ve kurulum belgeleri.

### 12 Ağustos 2026 çalışma ağacı notu

Bu belgenin yazıldığı anda çalışma ağacında Claude tarafından eklenen ama **henüz
commit/push/deploy edilmemiş** öneri taslağı vardır:

```text
src/lib/recommendations/
supabase/migrations/20260812000300_preference_signals.sql
docs/RECOMMENDATIONS.md
docs/RECOMMENDATIONS_OPEN_ISSUES.md
```

Ayrıca `src/app/api/rooms/[spaceId]/round/route.ts` ve
`src/lib/tmdb/search.ts` bu taslak için değiştirilmiştir. Bu değişiklikler
mevcut production'a gitmemiştir ve söz konusu migration Supabase'e uygulanmamıştır.
Bu ayrımı koruyun; önce tasarım/gizlilik kararları verilmeden bu taslağı push veya
deploy etmeyin.

---

## 3. Ana teknoloji ve katmanlar

| Katman | Seçim | Sorumluluk |
| --- | --- | --- |
| Web uygulaması | Next.js 16.3 + React 19 + TypeScript | UI, Route Handler'lar, Server Action'lar |
| Stil | Tailwind CSS 4, koyu/retro temel tema | Mevcut arayüz; görsel iyileştirme sonraya bırakıldı |
| Film verisi | TMDb API | Arama, film metadatası, Türkiye sağlayıcı bilgisi |
| Kimlik/veri | Supabase Auth + Postgres + RLS | Anonim kimlik, hesap, kütüphane, oda ve çark kalıcılığı |
| Barındırma | Vercel | GitHub `main` push'u ile Production deploy |
| Test | Vitest, TypeScript, ESLint, Next build | Saf mantık ve derleme doğrulaması |

Temel çağrı zinciri:

```text
Tarayıcı
  → Next.js API route / Server Action
  → server-only servis katmanı
  → Supabase (kullanıcının çerezli oturumu + RLS) veya TMDb
```

`SUPABASE_SERVICE_ROLE_KEY` hiçbir yerde kullanılmaz. Uygulama RLS'i atlayan
arka kapı içermez.

---

## 4. Ortam değişkenleri ve dış servis kurulumu

### Yerel `.env.local`

Gerçek değerler yalnızca yereldeki `.env.local` dosyasındadır. Gerekli **adlar**:

```text
TMDB_ACCESS_TOKEN
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
```

Kurallar:

- `TMDB_ACCESS_TOKEN` gizlidir, `NEXT_PUBLIC_` öneki olmamalıdır ve yalnızca
  `server-only` TMDb istemcisinde okunur.
- Supabase URL ve publishable/anon anahtarı tarayıcıda kullanılması tasarlanmış
  değerlerdir; tek başlarına veri yetkisi vermezler. Yetki RLS ile sağlanır.
- `.env.local` gitignore altındadır; GitHub'a eklenmez.
- `DEMO` değeri anahtarsız yerel önizleme için desteklenir; gerçek kullanıcı
  testi gerçek TMDb token'ı ile yapılır.

### Supabase

Kullanıcı tarafından oluşturulmuş gerçek Supabase projesi:

- Proje adı: `WatchMuse`
- Bölge seçimi: Central EU / Frankfurt
- Email provider: açık
- Confirm email: açık bırakıldı
- Allow new users to sign up: açık
- Allow anonymous sign-ins: açık — oda ve anonim başlangıç için zorunlu
- Manual linking: açık — anonim kimliği aynı `auth.uid()` üzerinde e-posta/
  şifreli hesaba yükseltmek için
- Yerel Site URL: `http://localhost:3000`
- Yerel callback redirect: `http://localhost:3000/auth/callback`
- Production callback redirect ayrıca Supabase URL Configuration'a eklenmelidir:
  `https://watch-muse-demo-v1.vercel.app/auth/callback`

> Supabase'in varsayılan e-posta gönderimi sınırlı test kullanımı içindir. Gerçek
> kullanıcı trafiğine yaklaşınca kendi SMTP sağlayıcısı bağlanmalıdır.

### Vercel Production

Vercel projesi: `watch-muse-demo-v1`.

Production/Preview için eklenen değişkenler:

| Değişken | Ortam | Sensitive |
| --- | --- | --- |
| `TMDB_ACCESS_TOKEN` | Production + Preview | Açık |
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | Kapalı |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | Kapalı; Vercel'de “Mark as Safe” onayı gerekir |
| `NEXT_PUBLIC_SITE_URL` | Sadece Production | Kapalı |

`NEXT_PUBLIC_SITE_URL` production değeri canlı Vercel alan adıdır. Ortam değişkeni
değiştirilince **Redeploy** gereklidir; Vercel eski deployment'ı sonradan değiştirmez.

---

## 5. Kimlik ve kişisel kütüphane kararları

### Karar: kayıt duvarı yok, anonim başlangıç var

Başta zorunlu kayıt, ürün henüz kullanıcıya değer vermeden sürtünme oluşturacağı
ve davet bağlantısıyla gelen partneri kaçıracağı için reddedildi.

Benimsenen akış:

```text
Ziyaret → anonim Supabase oturumu/auth.uid()
         → arama, kütüphane, oda kullanımı
         → istenirse e-posta doğrulama + şifre bağlama
         → aynı auth.uid(), aynı kişisel veriler
```

Uygulama tarafı:

- `src/components/auth/AnonymousSessionBootstrap.tsx`: Supabase yapılandırılmışsa
  anonim oturumu başlatır; davet rotasını yarış koşulundan korur.
- `src/lib/supabase/browser.ts`: aynı anda iki anonim giriş denemesini önlemek için
  tek uçuş (in-flight) koruması taşır.
- `src/lib/auth/dal.ts`: sunucuda `getUser()` ile doğrulama yapar; `getSession()`a
  güvenilmez.
- `/hesabini-kaydet`: anonim kullanıcıya e-posta bağlar, callback sonrası şifre
  belirletir. Kimlik değişmez; veri migrasyonu gerekmez.
- `/giris`, `/kayit`, `/sifre-sifirla`, `/auth/callback`: klasik hesap akışları.
- Açık yönlendirme saldırılarına karşı `safeRedirectPath()` vardır.

### Kişisel kütüphane

Kullanıcı şunları yapabilir:

- aramadan filmi `watchlist`e eklemek,
- izlenmişe taşımak,
- yalnızca `watched` kaydına 1–10 puan ve not girmek,
- kaydı silmek.

İlgili kod: `src/lib/library/*`, `src/components/library/*`, `/kutuphanem`.

Veritabanı kararları:

- `profiles`: `auth.users` ile aynı UUID.
- `library_items`: `unique(user_id, tmdb_movie_id)`.
- Puan ancak `watched` satırlarında kabul edilir.
- Poster yolu biçim kontrolü vardır.
- RLS, kullanıcının yalnızca kendi satırlarını okuma/yazmasını sağlar.

**Manuel doğrulama:** Yerelde izlenecek ekleme → izledim işaretleme → puan/not
girme → izlenmişler görünümü başarıyla denendi.

---

## 6. Oda, davet ve katılım mimarisi

İlgili migration'lar:

```text
20260811000100_rooms_schema.sql
20260811000200_rooms_rls.sql
20260811000300_rooms_functions.sql
```

Temel tablolar:

| Tablo | Görev |
| --- | --- |
| `spaces` | İki kişilik özel oda |
| `participants` | Oda kullanıcıları ve `host` / `guest` rolleri |
| `invitations` | Davet token'ının yalnızca SHA-256 özeti, bitiş zamanı ve kullanım bilgisi |

### Davet güvenliği kararları

- Davet token'ı kriptografik olarak sunucuda üretilir.
- Düz token veritabanına yazılmaz; yalnızca SHA-256 hash saklanır.
- Token 24 saatliktir ve kullanımdan sonra tüketilir.
- `/invite/<token>` açıldıktan sonra token hash'lenir, veritabanına hash gider;
  başarılı katılım ardından token içermeyen `/rooms/<spaceId>` adresine yönlenir.
- `/invite/:token*` için `Referrer-Policy: no-referrer`, `Cache-Control: no-store`
  ve `X-Robots-Tag: noindex, nofollow` header'ları tanımlıdır.
- Davet token'ı ilk açılış URL'sinde bulunur; tarayıcı geçmişi ve uygulama altyapı
  logları için bu kaçınılmaz yüzey ileride gözlemlenebilirlik eklenirken korunmalıdır.

### İki kişi sınırı ve yazma modeli

- Yalnız `host` ve `guest` enum rolleri vardır.
- `unique(space_id, role)` ve `unique(space_id, user_id)` veritabanı seviyesinde
  iki kişi/tek katılım savunmasıdır.
- Kritik yazma yalnızca `SECURITY DEFINER` RPC'lerden geçer:
  `create_space` ve `join_space_with_invitation`.
- RPC'ler `auth.uid()` kontrolü, kilitleme (`FOR UPDATE`), sabit `search_path`
  ve minimum execute grant'leri kullanır.
- İstemci `spaces`, `participants` veya `invitations` tablosuna doğrudan yazamaz.
- `invitations` için istemciye hiçbir okuma politikası yoktur.

### InviteRedirect düzeltmesi

React Strict Mode altında ilk effect isteği katılımı gerçekleştirip cleanup yüzünden
yönlendirmeyi iptal edebiliyordu. Düzeltme:

- `startedRef` yerine effect-bazlı `active` ve `redirectedRef` kullanıldı.
- İkinci effect idempotent RPC'yi tekrar çağırabilir.
- Yönlendirme `window.location.replace()` ile yapılır; yeni sayfada Supabase
  çerezinin görünmesi garanti edilir.

**Manuel doğrulama:** normal + gizli pencere ile davet katılımı, `2 / 2`, host ve
guest rollerinin görünmesi test edildi. İlk takılma sonrası bu düzeltmeyle akışın
çözüldüğü kullanıcı tarafından doğrulandı.

---

## 7. Gizli seçim turu ve ortak çark

İlgili migration:

```text
20260812000200_room_rounds_votes_and_wheel.sql
```

Temel tablolar:

| Tablo | Görev |
| --- | --- |
| `space_rounds` | Oda başına aktif seçim turu, durum, çark başlangıç zamanı ve kazanan |
| `room_candidates` | Tur için sunucuda kaydedilmiş tam 10 aday; sıra sabittir |
| `room_votes` | Kullanıcının kendi aday kararı |

Tur durumları:

```text
voting → matching → spinning → result
                    ↘ no_match → yeni aday turu
```

### Benimsenen ürün kuralları

- Her tur **tam 10** adaydan oluşur.
- Aday havuzu odada bir kez kaydedilir; iki katılımcıya aynı ID'ler ve aynı sıra
  gider.
- Sol kaydırma / buton: `skip` = İstemiyorum.
- Orta buton: `maybe` = Belki.
- Sağ kaydırma / buton: `want` = İzlemek isterim.
- Bireysel oylar partner tarafından görünmez.
- Başlangıç ürün kuralı: yalnızca iki tarafın da `want` dediği filmler ortak
  havuza girer. `maybe` çarka dahil değildir.
- Ortak film yoksa temiz bir turla yeni 10 aday getirilebilir.
- Çarkın kazananı istemci tarafından değil Postgres'te `random()` ile bir kez
  seçilir; `winner_candidate_id` ve `spin_started_at` saklanır.
- İki ekranda aynı sonuç için arayüz aynı sunucu zaman damgasını kullanır.
- Bu sürüm canlı push yerine yaklaşık 1,2 saniyelik yoklama kullanır. Supabase
  Realtime sonraki aşama olabilir.

### Güvenlik modeli

`room_votes` doğrudan istemciye açılmaz. Okuma için tek kapı
`get_space_round_state` RPC'sidir:

- kullanıcı yalnızca **kendi** oylarını alır;
- partner hakkında yalnızca “tamamladı / tamamlamadı” bilgisi döner;
- ortak adaylar iki taraf da tamamladıktan sonra görünür;
- kazanan çark aşamasında ortak animasyon için dönmektedir ancak UI sonuç metnini
  tur `result` durumuna gelene kadar göstermez.

Yazma RPC'leri:

```text
create_or_reset_space_round
cast_space_round_vote
start_space_round_wheel
get_space_round_state
```

API route'ları:

```text
GET/POST /api/rooms/[spaceId]/round
POST     /api/rooms/[spaceId]/round/votes
POST     /api/rooms/[spaceId]/round/spin
```

İlgili istemci arayüzü: `src/components/rooms/RoomRound.tsx`.

**Yerel manuel durum:** iki kullanıcıda aynı aday seti, gizli seçim akışı ve
çark işlevi tamamlandı olarak test edildi. Otomatik Supabase/RLS entegrasyon testi
bulunmamaktadır; bu iddialar test senaryosu değil manuel doğrulamadır.

---

## 8. TMDb kararları

- TMDb token'a erişen tek modül `src/lib/tmdb/client.ts`dir ve `server-only`
  korumasındadır. İstemci bileşeninden import edilirse build kırılmalıdır.
- Arama dili sabit `tr-TR`dir. İngilizce/Türkçe sorgunun farklı API dallarına
  gönderilmesi bilinçli olarak kaldırıldı.
- Sağlayıcı kontrolü Türkiye bölgesi (`TR`) ve `flatrate` üzerinden Netflix ile
  Amazon Prime Video için yapılır.
- TMDb'nin döndürdüğü izleme bağlantısı doğrudan JustWatch kabul edilmez;
  yalnız HTTPS ve güvenilen TMDb alan adları kabul edilir.
- Hata cevapları token veya upstream ham gövdesi sızdırmadan normalleştirilir.
- Oda turlarında ilk sürüm `discover/movie` ile popülerlik listesinden rastgele
  sayfa kullanır. Bu, gerçek kişiselleştirme değildir; [§14](#14-henüz-canlıya-alınmamış-öneri-taslağı) içindeki taslağın sebebi budur.

---

## 9. Uygulanmış Supabase migration envanteri

Kullanıcı Supabase SQL Editor üzerinden aşağıdaki migration'ları **ayrı ayrı,
sıralı ve başarılı** biçimde çalıştırdı:

```text
20260811000100_rooms_schema.sql
20260811000200_rooms_rls.sql
20260811000300_rooms_functions.sql
20260812000100_profiles_and_library.sql
20260812000200_room_rounds_votes_and_wheel.sql
```

Önemli kural: Bir migration uygulandıktan sonra değiştirilmez. Yeni şema veya
politika değişikliği yeni zaman damgalı migration olarak eklenir.

Kurulum/test belgeleri:

- `AUTH_AND_LIBRARY_SETUP.md`
- `ROOM_SELECTION_AND_WHEEL_SETUP.md`
- `docs/ROOMS_ARCHITECTURE.md`

Henüz uygulanmamış migration:

```text
20260812000300_preference_signals.sql
```

---

## 10. Test kanıtı

### Yayımlanmış `ccce84b` öncesi çalıştırılan kontroller

```text
npm.cmd run lint       → geçti
npm.cmd run typecheck  → geçti
npm.cmd run test       → 13 test dosyası, 154 test geçti
npm.cmd run build      → geçti
```

### 12 Ağustos 2026, yayımlanmamış recommendation taslağı ile çalışma ağacı

```text
npm.cmd run lint       → geçti
npm.cmd run typecheck  → geçti
npm.cmd run test       → 14 test dosyası, 174 test geçti
```

Bu ikinci sonuç, Claude'un yerel öneri değişikliklerini de kapsar; production
kanıtı değildir. Bu turda `npm audit --omit=dev` çalıştırılmadı. Docker/Supabase
CLI olmadığı için RLS, trigger ve yarış koşullarına karşı otomatik veritabanı
entegrasyon testi yoktur.

### Manuel doğrulamalar

| Akış | Durum | Kanıt türü |
| --- | --- | --- |
| Gerçek TMDb arama ve provider bilgisi | Çalışıyor | Yerel manuel test |
| Anonim kimlik + kütüphane ekleme/izlendi/puan | Çalışıyor | Yerel manuel test |
| Oda oluşturma ve davetle ikinci pencere katılımı | Çalışıyor | Normal + gizli pencere testi |
| 2/2 oda durumu ve roller | Çalışıyor | Manuel test |
| 10 aday, gizli kararlar, ortak çark | Yerelde çalıştı | Manuel test |
| Vercel Production build | Ready | `ccce84b` deploy sonrası Vercel ekranı |
| Canlı URL'de uçtan uca iki kişi turu | Yeniden test edilmeli | Vercel deploy sonrası kayıtlı kanıt yok |

---

## 11. Bilinen sınırlar ve sonraya bırakılan işler

### Ürün/UI

- Arayüz ve görsel tema mevcut aşamada işlevsel ama sade; kullanıcı bu tasarım
  iyileştirmelerini bilerek sonraya bıraktı.
- Ortak izlenenler geçmişi ve oda bazlı izleme sonrası değerlendirme yok.
- Bu sürümde ortak `want`lar arasında düz rastgele çark vardır. Daha gelişmiş
  `strong/acceptable/veto`, gizli Top 5, finalist seçimi ve uzlaşma dengesi
  önceki fikirlerdir; uygulanmış ürün kuralı değildir.
- Oda turu sonucu kişisel kütüphaneye otomatik “izlendi” olarak yazılmaz.

### Teknik/güvenlik

- API route'larında rate limiting / abuse koruması yok.
- Yapılandırılmış production loglama ve hata izleme yok.
- Supabase varsayılan e-posta servisi gerçek kullanım için ölçeklenmez; SMTP
  gerekir.
- Anonim kullanıcı cihaz verisini/cookie'sini silerse o geçici kimliğe dönemez.
- Kütüphane sayfalaması yok.
- Oda güncellemeleri polling kullanır; Realtime push yok.
- Davet token'ı ilk istekte URL'dedir; mevcut header'lar üçüncü taraf referrer
  sızıntısını azaltır ama tüm altyapı log riskini sıfırlamaz.

---

## 12. Değişmez geliştirme ve güvenlik ilkeleri

Yeni kod yazan herkes şunları korumalıdır:

1. Gerçek token, şifre veya `.env.local` içeriği okunmaz, loglanmaz, docs'a veya
   GitHub'a yazılmaz.
2. `TMDB_ACCESS_TOKEN` asla `NEXT_PUBLIC_` yapılmaz.
3. `SUPABASE_SERVICE_ROLE_KEY` eklenmez ve kullanılmaz.
4. Her yeni kullanıcı verisi tablosunda aynı migration içinde RLS düşünülür;
   client direct write varsayılan değildir.
5. Ayrıcalıklı Postgres fonksiyonları `SECURITY DEFINER`, sabit `search_path`,
   şema nitelikli isimler, `auth.uid()` doğrulaması ve minimum `EXECUTE` grant'i
   kullanır.
6. Oda dışındaki bir kullanıcının oda, oy veya davet verisini öğrenmesine izin
   verilmez.
7. Davet token'ı yalnız sunucu tarafında hash'lenir; düz token Postgres'e
   gönderilmez.
8. Sonuç rastgeleliği iki tarayıcıda ayrı üretilmez; sunucuda kaydedilir.
9. Migration uygulandıktan sonra düzenlenmez; yeni migration eklenir.
10. `main`e push öncesinde mümkün olduğunda `lint`, `typecheck`, `test`, `build`
    çalıştırılır. Kirli çalışma ağacında ilgisiz dosyalar otomatik stage edilmez.

---

## 13. GitHub ve Vercel yayın akışı

1. Yerelde değişikliği uygula ve kontrolleri çalıştır.
2. `git status` ile kapsamı incele; `.env.local` dahil edilmez.
3. İlgili dosyaları açıkça stage et.
4. Anlamlı tek commit oluştur.
5. `git push origin main` ile GitHub'a gönder.
6. Vercel Git bağlantısı Production deployment başlatır.
7. Yeni ortam değişkeni eklendi/değiştiyse Vercel Deployments'tan aynı commit'i
   **Production → Redeploy** et.
8. Vercel `Ready` olduktan sonra canlı URL'de kritik akışı tekrar dene.

GitHub CLI Windows'ta PATH'te görünmüyorsa kullanılan yol:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth status
```

GitHub CLI token'ı başarısız gösterirken sandbox ağ kısıtını gerçek geçersiz
token ile karıştırmayın; gerçek ağ bağlantısıyla `gh auth status` ve `git
ls-remote` doğrulaması yapılmalıdır.

---

## 14. Henüz canlıya alınmamış öneri taslağı

Claude tarafından sabah eklenen taslak, oda adaylarını şu sinyallerden seçmeyi
amaçlıyor:

```text
room vote: want / maybe / skip
library:   watchlist / watched
shown:     aday olarak gösterilmiş film
```

Taslak mimari:

```text
Postgres: user_movie_signals + 3 trigger + RPC'ler
TypeScript: weights.ts + scoring.ts + service.ts
Route: room round oluştururken aday havuzunu bu servisle kurma
```

Güçlü yönleri:

- Olgu/veri toplama ile puanlama politikasını ayırması doğrudur.
- `weights.ts` puanlama denemeleri için mantıklı bir merkezdir.
- İzlenmiş filmleri öneri havuzundan kesin eleme hedefi doğrudur.
- Saf sıralama/havuz mantığı test edilmiştir.

Bu taslak **uygulanmadan önce** çözülmesi gerekenler:

1. **Gizlilik riski:** iki kişinin toplam sinyalini dönen RPC, kullanıcı kendi
   sinyalini bildiği için partnerin geçmiş tercihini fark yoluyla tahmin etmeye
   izin verebilir. Oda önerisi için ham/toplam olgu yerine yalnızca güvenli nihai
   aday seti sunucuda oluşturulmalı veya veriler kişi başına izole edilmelidir.
2. **Puanlar işlevsel değildir:** sadece izlenmiş filmler puan alır ve onlar da
   kesin elenir. Film kimliği puanlamak, başka filmleri önermek için yeterli
   değildir. Tür/özellik profili olmadan `ratingBonusPerPoint` pratikte ölüdür.
3. **Gösterim cezası yanlış ömürlüdür:** `shownCount × 12` sınırsız büyür. Üstel
   zaman sönümü veya son 30 gün penceresi kullanılmalıdır. Ayrıca taslaktaki
   taze keşif slotları bu cezayı şu an doğrudan dikkate almaz.
4. **Denge sorunu:** iki kişinin sinyalleri toplandığı için kütüphanesi daha büyük
   kullanıcı aday havuzunun kişiselleştirilmiş kısmını domine edebilir. Kullanıcı
   başına normalize edilip ortak tercih/tür kesişimine öncelik verilmelidir.
5. **Sessiz fallback:** RPC/migration hatasında sistem taze keşfe düşüyor ama bunu
   kullanıcı/developer göremiyor. En azından development gözlemlenebilirliği
   eklenmelidir.
6. **Test boşluğu:** `service.ts`, RPC ayrıştırma, fallback ve trigger/RLS davranışı
   için otomatik entegrasyon testi yoktur.

### Önerilen karar sırası

1. `20260812000300_preference_signals.sql` migration'ını **henüz çalıştırma**.
2. Önce öneri RPC'sinin partner verisi sızdırmayacak biçimde yeniden tasarlanması.
3. Gösterim cezasını zaman pencereli/sönümlü hale getirme.
4. İlk anlamlı kişiselleştirme olarak **tür bazlı profil** ekleme:
   izlenmiş ve yüksek puanlı filmler → tür ağırlıkları → henüz izlenmemiş adaylar.
5. Ortak oda için iki kullanıcının tür profillerini normalize ederek kesişim ve
   denge odaklı aday üretme.
6. Daha sonra yönetmen/oyuncu/yıl özellikleri, deney ölçümü ve açıklanabilirlik.

Bu yüzden mevcut ürün dili için doğru ifade şudur:

> WatchMuse bugün güvenli oda seçimi ve kişisel kütüphane sunar. Kişiselleştirilmiş
> öneri altyapısı araştırma/taslak aşamasındadır; henüz production özelliği değildir.

---

## 15. Yeni agent için çalışma talimatı

Bu belge ile çalışacak yeni agent şu sırayı izlemelidir:

```text
1. Önce bu dosyayı oku.
2. git status ve git diff ile yayımlanmış main ile yerel taslakları ayır.
3. .env.local'ı okuma, değerlerini yazdırma veya commit etme.
4. Supabase/RLS/trigger davranışını entegrasyon testi olmadan "doğrulandı" sayma.
5. Öneri taslağını push/deploy etmeden önce §14 kararlarını ele al.
6. Değişiklik yapacaksan sadece kullanıcı tarafından onaylanan dar kapsamı uygula.
7. Sonuçta test komutlarını ve gerçek çıktıyı raporla.
```

---

## 16. Yararlı dosya haritası

```text
src/lib/tmdb/                    TMDb server-only istemcisi, normalizasyon, provider
src/lib/supabase/                ortam doğrulama ve browser/server istemcileri
src/lib/auth/                    anonim → kalıcı hesap bağlama, doğrulama, yönlendirme
src/lib/library/                 kişisel kütüphane servisleri ve validation
src/lib/rooms/                   oda, token, RPC servisleri, tur tipleri
src/components/rooms/            RoomCreator, InviteRedeemer, RoomWaiting, RoomRound
src/app/api/rooms/               oda oluşturma/katılma/durum/tur API'leri
supabase/migrations/             sıralı şema/RLS/RPC migration'ları
AUTH_AND_LIBRARY_SETUP.md        hesap + library + Vercel/Supabase kurulumu
ROOM_SELECTION_AND_WHEEL_SETUP.md oda turu migration ve iki pencere test rehberi
docs/ROOMS_ARCHITECTURE.md       oda güvenlik/akış dokümantasyonu
```

Bu dosya önemli bir mimari karar veya deploy sonrası güncellenmelidir.
