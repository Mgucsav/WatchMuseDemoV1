# WatchMuse — Geliştirme Raporu (AI için)

Bu dosya, projede şimdiye kadar yapılan tüm değişiklikleri, hangi dosyaların ne şekilde güncellendiğini, çalıştırma ve güvenlik adımlarını, kalan işleri ve ileriye dönük notları "başka bir yapay zekânın" anlayacağı açık, yapılandırılmış formatta listeler.

---

## 1) Proje Hedefi

- Proje: WatchMuse (eski adı: Film Abonelik Kontrolü)
- Amaç: Bir filmin Türkiye kataloğunda (TMDb kaynaklı) Netflix veya Amazon Prime Video aboneliğine dahil olup olmadığını göstermek.
- Tech: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Veri kaynağı: TMDb API (v4 read access token)

---

## 2) Özet: Yapılan Ana Değişiklikler

1. Güvenlik / Ortam değişkenleri
   - `.env.example` sanitasyonu: örnek dosya gerçek token içermez hale getirildi ve kullanım talimatı eklendi.
   - Yerel çalışma için `.env.local` kullanılmasının önerisi yinelendi.

2. API istemci dayanıklılığı
   - `src/lib/tmdb/client.ts`: TMDb isteği sırasında oluşan hata isimleri (`TimeoutError` veya `AbortError`) daha geniş şekilde ele alınarak `timeout` olarak sınıflandırıldı.

3. İstemci-API hata sarmalayıcısı
   - `src/lib/api/fetch-json.ts`: `fetchJson` fonksiyonuna `signal` parametresi opsiyonel hale getirildi ve `signal?.aborted` şeklinde güvenli kontrol eklendi.

4. Global stil ve marka (WatchMuse retro tema)
   - `src/app/globals.css`: WatchMuse retro siyah-beyaz tema, görüntü desaturation, utility sınıflar ve film-grain overlay eklendi.
   - `src/app/layout.tsx`: metadata WatchMuse olarak güncellendi; `body` etiketine temayı aktive eden sınıflar eklendi.

5. Dokümantasyon
   - `README.md` giriş bölümü WatchMuse markasına ve retro estetiğe göre güncellendi.
   - `WORK_SUMMARY.md` oluşturuldu (özet amaçlı).
   - `AI_README.md` (bu dosya) oluşturuldu.

---

## 3) Detaylı Dosya Değişiklikleri

Aşağıda her değişiklik yapılan dosya için: dosya yolu, ne değişti, ve ilgili kod parçacıkları (önce/sonra veya yeni içerik) verilmektedir.

### 3.1 `src/lib/api/fetch-json.ts`
- Amaç: `fetchJson` çağrısında `AbortSignal` parametresi zorunlu olduğu için bazı bileşenlerde runtime hatası oluyordu. Bunu opsiyonel yaptım.

Önce (kısmi):
```ts
export async function fetchJson<T>(
  url: string,
  signal: AbortSignal,
): Promise<T> {
  ...
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    ...
  }
}
```

Sonra (kısmi):
```ts
export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  ...
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    ...
  }
}
```

- Etki: İsteğe `signal` verilmediğinde `signal.aborted` referans hatası önlenir. Bileşenlerin `fetchJson`'u daha esnek kullanmasını sağlar.

---

### 3.2 `src/lib/tmdb/client.ts`
- Amaç: Farklı runtime'larda timeout hatası isimlendirmesi değişebildiği için, daha sağlam bir hata ayrımı getirdim.

Özet (kısmi):
```ts
try {
  response = await fetch(url, { ... , signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS) });
} catch (error) {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    throw new TmdbError("timeout", "TMDb belirlenen sürede yanıt vermedi. Lütfen tekrar deneyin.");
  }
  throw new TmdbError("network", "TMDb servisine ulaşılamadı...");
}
```

- Etki: Timeout veya abort durumları doğru şekilde `TmdbError` ile döndürülür ve API uçlarında uygun HTTP statüleri ile (client code `toErrorResponse`) işlenir.

---

### 3.3 `src/app/globals.css`
- Amaç: WatchMuse için retro siyah-beyaz tema ve yardımcı stiller eklendi.

Yeni önemli içerik (özet):
```css
:root { --wm-background: #0b0b0b; --wm-foreground: #efefef; --wm-accent: #d9d9d9; }
@media (prefers-color-scheme: light) { :root { --wm-background: #ffffff; --wm-foreground: #111111; } }
body.watchmuse-retro { background: var(--wm-background); color: var(--wm-foreground); font-family: var(--font-geist-sans), Georgia, 'Times New Roman', serif; }
img { filter: grayscale(100%) contrast(1.05); }
.film-grain::before { content: ""; pointer-events: none; position: fixed; inset: 0; background-image: linear-gradient(...); mix-blend-mode: overlay; }
.watchmuse-card { border: 1px solid var(--wm-accent); }
```

- Etki: Görseller gri tonlara çekilir, kontrast artırılır. `body`'ye eklenen sınıflarla (layout tarafında) tema aktif edilir.

---

### 3.4 `src/app/layout.tsx`
- Amaç: Metadata güncellemesi ve `body` sınıfına tema sınıflarının eklenmesi.

Kısmi değişiklik:
```tsx
export const metadata: Metadata = {
  title: "WatchMuse — Film Abonelik Kontrolü",
  description: "WatchMuse: TMDb verisiyle...",
};

// body sınıfı
<body className="flex min-h-full flex-col watchmuse-retro film-grain">{children}</body>
```

- Etki: Tarayıcıda başlık ve tema sınıfları ile global stil bağlanır.

---

### 3.5 `.env.example`
- Amaç: Repoda örnek dosyada gerçek token olmamalı. Dosya bilgilerle birlikte placeholder hâline getirildi.

Kısmi içerik:
```text
# Bu dosya örnektir ve DEPOYA GERÇEK TOKEN koymayın.
# Kopyalayın: Copy-Item .env.example .env.local
TMDB_ACCESS_TOKEN=your_tmdb_read_access_token_here
```

- Etki: Güvenlik riski azaltıldı.

---

### 3.6 `README.md` ve `WORK_SUMMARY.md`
- README başlığı ve giriş WatchMuse olarak güncellendi; `.env.local` oluşturma adımları ve güvenlik notu korunup netleştirildi.
- `WORK_SUMMARY.md` özet amaçlı eklendi.

---

## 4) Çalıştırma ve Doğrulama Adımları (Tekrar)

1. Node.js 20+ yüklü olmalı.
2. Proje dizininde:
```bash
npm install
npm run dev
```
3. Lokal `.env.local` oluşturun (repopuza gerçek token koymayın):
```powershell
Copy-Item .env.example .env.local
notepad .env.local
# veya
Set-Content -Path .env.local -Value 'TMDB_ACCESS_TOKEN=PASTE_YOUR_TOKEN_HERE'
```
4. Tarayıcı: http://localhost:3000 — arama arayüzü çalışmalı; "TMDb bağlantısı henüz yapılandırılmamış" hatası görünmemeli.

---

## 5) Güvenlikle İlgili Yapılacaklar / Öneriler

- `.env.local` kesinlikle commit edilmemeli. Repo `.gitignore` şu anda `.env*` maskesi içeriyor ancak `!.env.example` sayesinde örnek korunuyor.
- Eğer gerçek token yanlışlıkla repoya commitlendiyse:
  1. TMDb panelinden token'ı iptal/rotate edin.
  2. Repodan anahtar içeren commitleri temizleyin (`git filter-repo` veya `bfg`). Ben bu adımlarda yardımcı olabilirim.
- CI/CD ve prod için: platform secrets (Vercel/Netlify/GHA secrets) kullanın; `NEXT_PUBLIC_` prefixini kullanmayın (token istemciye sızar).

---

## 6) Kalan İşler (Önceliklendirilmiş)

1. ESLint ve TypeScript uyarılarını çalıştırıp düzeltme (kod kalitesi).
2. Otomatik testler / basic e2e veya unit test ekleme.
3. CI pipeline (GitHub Actions) ile lint/typecheck ve build doğrulaması.
4. Opsiyonel: WatchMuse görsel marka dosyaları (logo, ikon), daha belirgin retro tipografi ve bir film-grain görsel overlay asset'i.

---

## 7) Repoyu Devralacak Bir AI İçin Notlar (paragraf halinde, kısa)

- Bu repo Next.js App Router yapısında; server-only modüller `import "server-only";` ile işaretlenmiş. TMDb erişim katmanı (`src/lib/tmdb/*`) sunucu tarafında çalışır.
- TMDb çağrıları `Authorization: Bearer <TMDB_ACCESS_TOKEN>` başlığı ile yapılıyor; token sadece `src/lib/tmdb/client.ts` tarafından okunur.
- `src/lib/normalize.ts` içindeki yardımcılar ham TMDb yanıtlarını uygulama tiplerine çevirir (typesafe). Arayüz asla ham TMDb çıktısını doğrudan render etmez.
- Önlemler: istek zaman aşımı, in-memory TTL cache, hata sınıfları (`TmdbError`) ve API hata sarma (`toErrorResponse`) uygulanmış durumda.

---

## 8) İstenirse Yapabileceğim Otomatik Adımlar

- `ESLint --fix` ve `tsc --noEmit` çalıştırıp çıkan hataları düzeltmek.
- CI (GitHub Actions) konfigürasyonu şablonu eklemek.
- Eğer repo geçmişinde gerçek token commitlenmişse, geçmiş temizliği ve token rotasyonu adımlarını yönlendirmek ve örnek komutları uygulamak.
- Daha fazla görsel temayla (logo, SVG icon, tipografi) WatchMuse marka kitini genişletmek.

---

## 9) İrtibat / Sonraki Adım

Hangi adımı tercih ediyorsunuz:
- A: Hemen `npm run dev` çıktısını inceleyeyim (console/terminal çıktısını paylaşın).
- B: ESLint / TypeScript uyarılarını düzeltmeye başlıyorum.
- C: Repo geçmişinden (varsa) token sızıntısını temizleyeyim.
- D: WatchMuse görselleştirmesini derinleştireyim (logo, font, grain image).

Cevabınıza göre bir sonraki değişiklikleri otomatik uygulayıp commit mesajlarıyla birlikte hazırlayabilirim.

---

*Bu dosya otomatik oluşturuldu. Üzerinde değişiklik isterseniz bana söyleyin, ben güncellemesini yaparım.*
