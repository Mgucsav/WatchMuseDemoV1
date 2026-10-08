/**
 * WatchMuse markası, yalnız kırmızı ve beyaz:
 *
 * - `LogoMark`: logo — beyaz gölgeli, büyük kırmızı bir "W". Sol panelde ve
 *   sekme simgesinde (`src/app/icon.svg`) kullanılır.
 * - `Wordmark`: "WATCHMUSE" yazısı — WATCH beyaz, MUSE kırmızı, altında
 *   kırmızı-beyaz retro şeritler. Tanıtım ve giriş sayfalarının sol üstünde
 *   kullanılır; bu sayfalarda "W" gösterilmez.
 */
const W_POINTS = "8,9 15.5,34 24,17 32.5,34 40,9";

export function LogoMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      strokeWidth="6.5"
      strokeLinejoin="miter"
      strokeMiterlimit="10"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <polyline points={W_POINTS} transform="translate(2.5 2.5)" className="stroke-wm-foreground" />
      <polyline points={W_POINTS} className="stroke-brand-red" />
    </svg>
  );
}

const SIZES = {
  sm: { text: "text-[26px]", stripe: "h-0.5", stripes: "mt-1 gap-0.5" },
  md: { text: "text-[34px]", stripe: "h-[3px]", stripes: "mt-1.5 gap-[3px]" },
  lg: { text: "text-[64px]", stripe: "h-[5px]", stripes: "mt-2 gap-1" },
} as const;

/** "WATCHMUSE" yazısı ve altındaki kırmızı-beyaz şeritler. */
export function Wordmark({ size = "md" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className="inline-flex flex-col">
      <span
        className={`font-display leading-none tracking-[0.06em] text-wm-foreground ${s.text}`}
      >
        Watch<span className="text-brand-red">Muse</span>
      </span>
      <span aria-hidden="true" className={`flex flex-col ${s.stripes}`}>
        <span className={`${s.stripe} bg-brand-red`} />
        <span className={`${s.stripe} bg-wm-foreground`} />
      </span>
    </span>
  );
}
