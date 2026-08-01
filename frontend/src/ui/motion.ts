import type { Transition, Variants } from "motion/react"

/**
 * Shared motion vocabulary.
 *
 * Everything uses the same two curves so the whole app decelerates alike.
 * `ease` is Apple's standard ease-out — quick to start, settling gently. No
 * spring bounce: overshoot on a data table reads as instability, not polish.
 */
export const ease: Transition["ease"] = [0.16, 1, 0.3, 1]

export const fast: Transition = { duration: 0.22, ease }
export const normal: Transition = { duration: 0.32, ease }
export const slow: Transition = { duration: 0.45, ease }

/** Page-level entrance: a short rise, never a slide across the viewport. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: normal },
}

/** Parent of a list of cards; children arrive in quick succession. */
export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
}

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: normal },
}

/** Dialogs scale from 98%, not 80% — a big scale reads as a cartoon zoom. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: fast },
  exit: { opacity: 0, scale: 0.985, y: 4, transition: { duration: 0.15, ease } },
}

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: fast },
  exit: { opacity: 0, transition: { duration: 0.15, ease } },
}

/** Sheets on mobile rise from the bottom edge, iOS style. */
export const sheetVariants: Variants = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0, transition: { duration: 0.34, ease } },
  exit: { opacity: 0, y: "100%", transition: { duration: 0.22, ease } },
}
