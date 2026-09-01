/**
 * Modal davranışının saf (DOM'dan bağımsız) kuralları.
 *
 * Bu modül bilinçli olarak `server-only` DEĞİLDİR ve hiçbir global'e
 * dokunmaz: `document`, `window` ve olay nesneleri parametre olarak geçilir.
 * Böylece kapanma kararı, kaydırma kilidi, odak tuzağı ve bayat yanıt koruması
 * tarayıcı ortamı kurmadan doğrudan test edilebilir.
 */

/**
 * Odak tuzağının dikkate aldığı öğeler.
 *
 * `[hidden]` ve `disabled` öğeler ile `tabindex="-1"` taşıyan öğeler bilinçli
 * olarak dışarıda bırakılır: bunlar sekme sırasına girmez.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
]
  .map((selector) => `${selector}:not([hidden])`)
  .join(", ");

/**
 * Yalnızca arka planın KENDİSİNE yapılan tıklama modalı kapatır.
 *
 * İçerikte başlayan bir tıklama olayı köpürerek arka plana ulaşsa bile
 * kapatmamalıdır; bu yüzden karşılaştırma `contains` ile değil, kimlik
 * eşitliğiyle yapılır.
 */
export function shouldCloseOnBackdropClick(
  eventTarget: unknown,
  backdrop: unknown,
): boolean {
  if (backdrop === null || backdrop === undefined) return false;
  return eventTarget === backdrop;
}

/**
 * Kaydırma çubuğunun kapladığı genişlik.
 *
 * `overflow: hidden` uygulandığında kaydırma çubuğu kaybolur ve sayfa yana
 * kayar. Aynı genişlik `padding-right` olarak telafi edilerek bu sıçrama
 * engellenir. Çubuğun hiç yer kaplamadığı ortamlarda (mobil, overlay
 * scrollbar) sonuç 0'dır.
 */
export function computeScrollbarCompensation(
  innerWidth: number,
  clientWidth: number,
): number {
  if (!Number.isFinite(innerWidth) || !Number.isFinite(clientWidth)) return 0;

  const difference = innerWidth - clientWidth;

  return difference > 0 ? difference : 0;
}

/** `lockBodyScroll` için gereken en küçük DOM yüzeyi. */
export interface ScrollLockTarget {
  body: { style: { overflow: string; paddingRight: string } };
  documentElement: { clientWidth: number };
  innerWidth: number;
}

/**
 * Gövde kaydırmasını kilitler ve **tam olarak eski değerleri geri yükleyen**
 * bir temizleme fonksiyonu döndürür.
 *
 * Önceki satır içi değerler saklanır; modal kapandığında sayfa, modal hiç
 * açılmamış gibi kalır. Sabit bir `""` yazmak, sayfanın kendi satır içi
 * stilini sessizce silerdi.
 */
export function lockBodyScroll(target: ScrollLockTarget): () => void {
  const { style } = target.body;

  const previousOverflow = style.overflow;
  const previousPaddingRight = style.paddingRight;

  const compensation = computeScrollbarCompensation(
    target.innerWidth,
    target.documentElement.clientWidth,
  );

  style.overflow = "hidden";
  if (compensation > 0) {
    style.paddingRight = `${compensation}px`;
  }

  let released = false;

  return () => {
    // Çift çağrı (StrictMode çift efekti, hızlı aç/kapa) eski değeri ikinci kez
    // yazıp bozmamalıdır.
    if (released) return;
    released = true;

    style.overflow = previousOverflow;
    style.paddingRight = previousPaddingRight;
  };
}

/**
 * Sekme tuşunun odağı modalın dışına çıkarmasını engeller.
 *
 * Döndürülen öğe varsa odak oraya taşınmalı ve olay iptal edilmelidir; `null`
 * ise tarayıcının kendi sırası doğrudur ve olaya karışılmaz.
 *
 * Odak modalın dışındaysa (ör. arka plandaki bir öğe) sekme yönüne göre ilk ya
 * da son öğeye geri çekilir.
 */
export function resolveFocusTrapTarget<T>(
  focusable: readonly T[],
  active: T | null,
  backwards: boolean,
): T | null {
  if (focusable.length === 0) return null;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (active === null || !focusable.includes(active)) {
    return backwards ? last : first;
  }

  if (backwards && active === first) return last;
  if (!backwards && active === last) return first;

  return null;
}

/**
 * Bayat yanıt koruması.
 *
 * Tamamlanan istekler ait oldukları film kimliğiyle birlikte saklanır.
 * Görüntülenen durum bu kayıttan TÜRETİLDİĞİ için, kimlik değiştiği anda eski
 * sonuç kendiliğinden geçersiz olur: geç gelen bir yanıt yeni filmin ekranını
 * boyayamaz.
 *
 * Kimlik her zaman TMDb ID'sidir; başlık karşılaştırılmaz. Aynı adı taşıyan
 * farklı TMDb kayıtları bu yüzden birbirine karışmaz.
 */
export function stateForMovie<S>(
  outcome: { movieId: number; state: S } | null,
  movieId: number,
  loadingState: S,
): S {
  if (outcome === null) return loadingState;

  return outcome.movieId === movieId ? outcome.state : loadingState;
}

/** Dakikayı "2s 28dk" biçimine çevirir. Geçersiz süre `null` döner. */
export function formatRuntime(minutes: number | null): string | null {
  if (minutes === null || !Number.isInteger(minutes) || minutes <= 0) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours === 0) return `${remaining}dk`;
  if (remaining === 0) return `${hours}s`;

  return `${hours}s ${remaining}dk`;
}
