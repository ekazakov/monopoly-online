import type { Token } from "@monopoly/shared";
import type { ReactNode } from "react";

// Outline avatar icons on a 48 x 48 grid (spec 4.3), ported from the prototype icons. The figure
// of a token has the key of the token.
export type AvatarKind = Token;

const dot = { fill: "currentColor", stroke: "none" } as const;

const ICONS: Record<AvatarKind, ReactNode> = {
  cat: (
    <>
      <path d="M13.6 13L13 3.5L20 8Q24 7 28 8L35 3.5L34.4 13Q36 15 35 18Q32 26 24 26Q16 26 13 18Q12 15 13.6 13Z" />
      <path d="M17 25.5C13 30 12 36 14 42H34C36 36 35 30 31 25.5" />
      <path d="M24 33V42" />
      <path d="M34 41C41 41 44 36 43 31C42.5 28 40 27.5 39 29" />
      <path d="M22.8 19.5H25.2L24 21Z" />
      <path
        d="M9.5 18.5L14.5 19.5M9.5 22L14.5 21.5M38.5 18.5L33.5 19.5M38.5 22L33.5 21.5"
        strokeWidth="1.6"
      />
      <circle cx="19.5" cy="15.5" r="1.1" {...dot} />
      <circle cx="28.5" cy="15.5" r="1.1" {...dot} />
    </>
  ),
  dog: (
    <>
      <path d="M5 15.5L15 12L22 13.5L37 15C40 15.5 41 18 41 21V33H15V25.5L10.5 19.5L6 18.5C4.5 18.2 4 16.5 5 15.5Z" />
      <path d="M15.5 12L17 4L21.5 13.2" />
      <path d="M37.5 15.2L41.5 6L44 7.5L41 18" />
      <path d="M17 33V40H22V33M34 33V40H39V33" />
      <path d="M8.5 19.5L8 23M11.5 21L11 25" strokeWidth="1.8" />
      <circle cx="11.5" cy="15.8" r="1.1" {...dot} />
      <circle cx="5.8" cy="16" r="1.4" {...dot} />
    </>
  ),
  penguin: (
    <>
      <path d="M24 4C15 4 12 12 12 22C12 33 15 41 24 41C33 41 36 33 36 22C36 12 33 4 24 4Z" />
      <path d="M24 19C19.5 19 17.5 24 17.5 30C17.5 35.5 20 39.5 24 39.5C28 39.5 30.5 35.5 30.5 30C30.5 24 28.5 19 24 19Z" />
      <path d="M12.5 20C8 23 6.5 29 7.5 34C10 32.5 12 29 12.8 26" />
      <path d="M35.5 20C40 23 41.5 29 40.5 34C38 32.5 36 29 35.2 26" />
      <path d="M21.5 13.5H26.5L24 17.5Z" />
      <ellipse cx="18" cy="43.5" rx="4.5" ry="2" />
      <ellipse cx="30" cy="43.5" rx="4.5" ry="2" />
      <circle cx="20" cy="10" r="1.2" {...dot} />
      <circle cx="28" cy="10" r="1.2" {...dot} />
    </>
  ),
  car: (
    <g transform="translate(0 -5)">
      <path d="M4 34V29.5Q4 27.5 6 27L18 25L22 20.5H30L33 25L41.5 27Q44 27.5 44 30V34H39.5A6.5 6.5 0 0 0 26.5 34H21.5A6.5 6.5 0 0 0 8.5 34Z" />
      <path d="M21 24.5L23.5 21.8H28.5L30.5 24.5Z" />
      <circle cx="15" cy="34" r="4.5" />
      <circle cx="33" cy="34" r="4.5" />
      <circle cx="15" cy="34" r="1.2" {...dot} />
      <circle cx="33" cy="34" r="1.2" {...dot} />
    </g>
  ),
  horse: (
    <>
      <path d="M5.5 24.5L4 21.5C4 19.5 5.5 18 7 16.5L11.5 11L12.5 4.5L17 9.5C20 9 24 10 28 12H36C40 12 43 15 43 19V30H38V41H33.5V30H21V41H16.5V30L14 20.5L9.5 26.5C8 27.5 6.5 26.5 5.5 24.5Z" />
      <path d="M43 17C46.5 19.5 46.5 28 44 35" />
      <path d="M14 12.5L16.5 17.5M18 10.5L20.5 15.5" strokeWidth="1.8" />
      <circle cx="9.8" cy="17.6" r="1.1" {...dot} />
      <circle cx="5.6" cy="22.2" r="1" {...dot} />
    </>
  ),
  duck: (
    <>
      <circle cx="14" cy="12" r="6.5" />
      <path d="M8 12.5L2.5 14.5L8.5 17" />
      <path d="M11.5 17.8C10 22 8 25 8 29C8 37 15 42 25 42C36 42 41 36.5 42 30L45 22L38 25.5C34 25.5 31 22.5 27 22C22 21.5 19 21 17.5 17.8" />
      <path d="M20 31C24 28 31 29 34 33C31 37 24 37 20 31Z" />
      <circle cx="12" cy="10.8" r="1.1" {...dot} />
    </>
  ),
};

export function AvatarIcon({ kind, size = 38 }: { kind: AvatarKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[kind]}
    </svg>
  );
}
