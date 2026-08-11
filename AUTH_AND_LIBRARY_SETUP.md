# Hesap ve Kişisel Kütüphane — Kurulum

Bu belge, hesap açmaya zorlamayan kişisel film kütüphanesini ve sonradan
e-posta/şifre ile kalıcı hesaba geçişi çalışır hale getirmek için gereken
adımları anlatır.

> **Bu kuruluma girmeden de uygulama çalışır.** Film arama (DEMO veya gerçek
> TMDb token'ıyla) ve oda akışı Supabase olmadan da çalışmaya devam eder.
> Yalnızca hesap ve kütüphane ekranları "yapılandırılmamış" mesajı gösterir.

---

## 1. Supabase projesi oluşturma

1. [supabase.com](https://supabase.com) → **New project**
2. Bir isim, güçlü bir veritabanı şifresi ve size yakın bir bölge seçin.
3. Proje hazır olana kadar bekleyin (birkaç dakika).

## 2. Email/Password provider'ı açma

**Authentication → Sign In / Providers → Email**

- **Enable Email provider: AÇIK**
- **Confirm email:** açık bırakmanız önerilir. Açıkken kullanıcı kayıt olduktan
  sonra doğrulama bağlantısına tıklamadan oturum açamaz.
- **Anonymous sign-ins: AÇIK** — bunu kapatmayın; **oda akışı bu ayara
  bağlıdır**. Anonim ziyaretçi gerçek bir `auth.uid()` alır; odaları ve kendi
  kişisel kütüphanesi bu kimlikle kullanır. Tarayıcı verisini silerse bu geçici
  kimliğe geri dönemez.
- **Manual Linking: AÇIK** — Dashboard'da bu ayar görünüyorsa açın. WatchMuse,
  “Puanlarını kaydet” adımında yeni kullanıcı oluşturmak yerine anonim kimliğe
  e-posta bağlar. Böylece `user_id` ve kayıtlar değişmez.

Kullanıcı akışı şöyledir: ziyaretçi doğrudan film ekler, puan verir ve odaya
katılır. Beş filmden sonra (veya istediği anda) “Puanlarını kaydet” çağrısı
görür. E-posta doğrulamasından sonra şifre belirler; mevcut liste taşınmaz,
aynı kimlik üzerinde kalır.

## 3. Site URL ve Redirect URL ayarları

**Authentication → URL Configuration**

| Alan | Yerel geliştirme | Vercel (production) |
| --- | --- | --- |
| **Site URL** | `http://localhost:3000` | `https://<projeniz>.vercel.app` |
| **Redirect URLs** | `http://localhost:3000/auth/callback` | `https://<projeniz>.vercel.app/auth/callback` |

Her iki adresi de **Redirect URLs** listesine ekleyebilirsiniz; hem yerelde hem
canlıda çalışır. Vercel önizleme (preview) dağıtımları da kullanacaksanız
`https://<projeniz>-*.vercel.app/auth/callback` desenini eklemeniz gerekir.

> Bu adres yanlışsa doğrulama ve şifre sıfırlama bağlantıları çalışmaz;
> kullanıcı "Bağlantı geçersiz" mesajı görür.

## 4. Migration'ları uygulama

Migration dosyaları `supabase/migrations/` altındadır ve **sırayla** uygulanır:

```
20260811000100_rooms_schema.sql        odalar (mevcut)
20260811000200_rooms_rls.sql           odalar RLS (mevcut)
20260811000300_rooms_functions.sql     odalar RPC (mevcut)
20260812000100_profiles_and_library.sql  ← YENİ: profiller + kütüphane
20260812000200_room_rounds_votes_and_wheel.sql  ← YENİ: gizli oda oyları + ortak çark
```

**Seçenek A — Supabase CLI (önerilir):**

```bash
supabase link --project-ref <proje-ref>
supabase db push
```

**Seçenek B — Dashboard SQL Editor:**
Dosyaları yukarıdaki sırayla yapıştırıp çalıştırın.

### Doğrulama

```sql
-- Tablolar oluştu mu?
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','library_items');

-- RLS açık mı? (ikisi de true olmalı)
select relname, relrowsecurity from pg_class
where relname in ('profiles','library_items');

-- Politikalar yerinde mi? (her tablo için 4 satır beklenir)
select tablename, policyname, cmd from pg_policies
where tablename in ('profiles','library_items')
order by tablename, cmd;

-- Yeni kullanıcı trigger'ı kurulu mu?
select tgname from pg_trigger where tgname = 'on_auth_user_created';
```

Kayıt olduktan sonra profilin otomatik açıldığını görmek için:

```sql
select id, display_name, created_at from public.profiles order by created_at desc limit 5;
```

### Oda turu doğrulaması

Yeni oda turu migration'ı uygulandıktan sonra aşağıdaki kontrolü bir kez yapın:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('space_rounds', 'room_candidates', 'room_votes');
```

Üç tablo da dönmeli ve `rowsecurity` değeri `true` olmalıdır. Uygulamada iki
ayrı tarayıcı oturumuyla odaya girin: ikinize de aynı 10 filmin geldiğini, tek
tek oyların görünmediğini, ortak adayların ikiniz bitirince açıldığını ve çark
sonucunun iki tarafta aynı olduğunu kontrol edin.

## 5. Yerel `.env.local` değişkenleri

`.env.example` dosyasını kopyalayın ve doldurun:

```
TMDB_ACCESS_TOKEN=<gerçek TMDb read access token>   # veya DEMO
NEXT_PUBLIC_SUPABASE_URL=https://<proje-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable anahtar>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Değerleri **Project Settings → API** bölümünden alın.

> `.env.local` `.gitignore` ile depo dışında tutulur ve **asla commit
> edilmemelidir**.

## 6. Vercel Environment Variables

**Project → Settings → Environment Variables**

| Değişken | Ortam | Not |
| --- | --- | --- |
| `TMDB_ACCESS_TOKEN` | Production + Preview | Gizli. `NEXT_PUBLIC_` öneki **yok**. |
| `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview | Gizli değil |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview | Gizli değil |
| `NEXT_PUBLIC_SITE_URL` | Production | Örn. `https://<projeniz>.vercel.app` |

Değişkenleri ekledikten sonra **yeniden dağıtım (redeploy)** gerekir; Next.js
`NEXT_PUBLIC_*` değerlerini derleme sırasında gömer.

`NEXT_PUBLIC_SITE_URL` değerini Preview ortamına eklemeyin; Preview'da boş
kalırsa uygulama gelen isteğin geçici Vercel adresini güvenli biçimde kullanır.
Bu durumda yukarıdaki Preview Redirect URL deseni mutlaka eklenmiş olmalıdır.

---

## Güvenlik notları

**`SUPABASE_SERVICE_ROLE_KEY` bu projede kullanılmaz.** Ne `.env.local`'a ne
Vercel'e ekleyin. Bu anahtar Row Level Security'yi tamamen atlar; sızması tüm
kullanıcı verisinin okunabilir hale gelmesi demektir.

| Değişken | Gizli mi? | Neden |
| --- | --- | --- |
| `TMDB_ACCESS_TOKEN` | **Evet** | Yalnızca sunucuda okunur; `server-only` ile korunur |
| `NEXT_PUBLIC_SUPABASE_URL` | Hayır | Adres bilgisi |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Hayır | Tarayıcı için tasarlandı; erişimi RLS belirler |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Kullanılmıyor, eklemeyin** |

**Gerçek anahtarlar GitHub'a eklenmez.** `.env.local` `.gitignore` içindedir;
`.env.example` yalnızca yer tutucu değerler içerir. Bir anahtar yanlışlıkla
commit edilirse önce ilgili panelden **iptal edip yenileyin**, sonra geçmişi
temizleyin.

## Veri erişim modeli

| Tablo | Kim görebilir | Kim değiştirebilir |
| --- | --- | --- |
| `profiles` | Yalnızca sahibi | Yalnızca sahibi |
| `library_items` | Yalnızca sahibi | Yalnızca sahibi |

Bu kurallar veritabanı seviyesinde (RLS) uygulanır. Uygulama katmanı tamamen
atlansa bile bir kullanıcı başkasının kütüphanesini göremez.

Anonim Supabase kullanıcıları veritabanında `authenticated` rolüyle çalışır;
RLS yine `auth.uid()` eşleşmesini zorlar. Buradaki `anon` API rolüyle aynı şey
değildir. Bu nedenle geçici ziyaretçi yalnızca **kendi** satırlarını okuyup
yazabilir, başka kullanıcının verisini asla göremez.

Ek olarak:

- `library_items` üzerinde `unique(user_id, tmdb_movie_id)` — aynı film bir
  kullanıcıda tekrar edemez.
- `rating` yalnızca 1–10 aralığında ve yalnızca `watched` durumundaki
  kayıtlarda kabul edilir.
- `poster_path` biçimi kısıtlanmıştır; arayüze rastgele bir adres yazılamaz.

## Sorun giderme

| Belirti | Olası sebep |
| --- | --- |
| "Hesap servisi henüz yapılandırılmamış" | `NEXT_PUBLIC_SUPABASE_*` değişkenleri eksik; sunucuyu yeniden başlatın |
| Doğrulama bağlantısı "Bağlantı geçersiz" diyor | Redirect URL listesinde `/auth/callback` yok, ya da bağlantı bir kez kullanılmış |
| Kayıt oluyor ama profil satırı yok | `on_auth_user_created` trigger'ı kurulmamış; migration'ı tekrar uygulayın |
| Oda oluşturma bozuldu | **Anonymous sign-ins** kapatılmış olabilir; açın |
| Kütüphane boş görünüyor ama kayıt var | Farklı bir hesapla giriş yapılmış olabilir |
| “Puanlarını kaydet” e-postası gitmiyor | Email provider, Manual Linking veya Redirect URL ayarını kontrol edin |
| Anonim ziyaretçi çok oluşuyor | Production'a yaklaşırken Authentication → Bot Detection üzerinden CAPTCHA/Turnstile açın |
