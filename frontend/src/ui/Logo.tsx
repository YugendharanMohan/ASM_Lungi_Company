import { cn } from "@/lib/utils"

/**
 * The company mark.
 *
 * Sits on a white disc in both themes rather than on the app's surface. The
 * artwork is light-on-transparent — a pale blue ring, near-white interior and
 * navy lettering — so on the dark theme's near-black background the wordmark
 * around the rim all but disappears. A white disc keeps the mark legible
 * everywhere and reads as deliberate, since the logo is already a circular
 * badge.
 *
 * `alt` is empty by design: every place this appears, the company name is
 * written beside it, and a screen reader announcing both says it twice.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white",
        className,
      )}
    >
      <img
        src="/logo.png"
        alt=""
        width={512}
        height={512}
        className="size-full object-contain"
      />
    </span>
  )
}
