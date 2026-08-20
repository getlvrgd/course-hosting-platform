import Image from "next/image";

/**
 * The LVRGD wordmark.
 *
 * Two files rather than one with a CSS filter: the mark is solid black and solid
 * white, and `invert()` on a partially transparent PNG dirties the antialiased edges.
 * Which one shows is decided in globals.css by the same rules that drive every other
 * token, so it follows both the OS setting and the in-page theme toggle.
 *
 * Both are rendered and one is hidden, so there is no flash of the wrong mark on first
 * paint the way a JS-decided swap would give.
 */
export function Logo({ height = 20 }: { height?: number }) {
  // Trimmed to the wordmark itself, so this ratio is the artwork's own.
  const width = Math.round(height * (482 / 267));

  return (
    <span
      className="inline-block shrink-0 leading-none"
      style={{ width, height }}
    >
      <Image
        src="/lvrgd-black.png"
        alt="LVRGD"
        width={482}
        height={267}
        priority
        className="logo-light h-full w-full object-contain"
      />
      <Image
        src="/lvrgd-white.png"
        alt=""
        aria-hidden
        width={482}
        height={267}
        priority
        className="logo-dark h-full w-full object-contain"
      />
    </span>
  );
}
