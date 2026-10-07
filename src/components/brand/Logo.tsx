/**
 * WatchMuse logosu: yeşil, makara delikli bir film karesi içinde kırmızı "W";
 * yanında sinema afişi yazısıyla "WATCHMUSE" ve altında kırmızı-yeşil retro
 * şeritler.
 *
 * Renkler marka token'larıdır (`brand-green`, `brand-red`). Sekme simgesi aynı
 * çizimin siyah zemin üzerindeki kopyasıdır: `src/app/icon.svg`.
 */
const SPROCKET_X = [9.5, 16, 22.5, 29, 35.5];
const SPROCKET_Y = [10.5, 34.5];

export function LogoMark({
  size = 24,
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
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect
        x="4.5"
        y="6.5"
        width="39"
        height="35"
        rx="5"
        strokeWidth="3"
        className="stroke-brand-green"
      />
      {SPROCKET_Y.flatMap((y) =>
        SPROCKET_X.map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="3"
            height="3"
            rx="0.6"
            className="fill-brand-green"
          />
        )),
      )}
      <polyline
        points="12.5,18 17.5,31 24,21.5 30.5,31 35.5,18"
        strokeWidth="3.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-brand-red"
      />
    </svg>
  );
}

const SIZES = {
  sm: { mark: 30, gap: "gap-2.5", text: "text-[26px]", stripe: "h-0.5", stripes: "mt-1 gap-0.5" },
  md: { mark: 40, gap: "gap-3", text: "text-[34px]", stripe: "h-[3px]", stripes: "mt-1.5 gap-[3px]" },
  lg: { mark: 72, gap: "gap-4", text: "text-[64px]", stripe: "h-[5px]", stripes: "mt-2 gap-1" },
} as const;

/** İşaret, "WATCHMUSE" yazısı ve retro şeritler. */
export function Logo({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap}`}>
      <LogoMark size={s.mark} className="shrink-0" />
      <span className="flex flex-col">
        <span
          className={`font-display leading-none tracking-[0.06em] text-wm-foreground ${s.text}`}
        >
          Watch<span className="text-brand-red">Muse</span>
        </span>
        <span aria-hidden="true" className={`flex flex-col ${s.stripes}`}>
          <span className={`${s.stripe} bg-brand-red`} />
          <span className={`${s.stripe} bg-brand-green`} />
        </span>
      </span>
    </span>
  );
}
