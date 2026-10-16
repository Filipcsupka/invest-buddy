import type { ReactNode, SVGProps } from "react";
import type { KitState } from "./types";
import { IconBandBroken, IconBandIgnore, IconBandSetup, IconBandWait, IconBandWatch, IconDip, IconNoData } from "../icons";

type Props = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: Props & { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" className="icon" {...props}>
      {children}
    </svg>
  );
}

/** Padlock drawn on the 16px sheet grid. Lock cards and the Paid badge. */
export const IconLock = (p: Props) => (
  <Icon {...p}>
    <rect x="3" y="7" width="10" height="7" />
    <path d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2" />
  </Icon>
);

export const IconPause = (p: Props) => (
  <Icon {...p}>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Icon>
);

export const IconPlay = (p: Props) => (
  <Icon {...p}>
    <path d="M5 3.5v9l7-4.5z" />
  </Icon>
);

/** Rule result marks. Each path has pathLength 1 so the check-in motion can draw it. */
export function ResultMark({ result }: { result: "pass" | "fail" | "none" }) {
  return (
    <svg className="kit-mark-svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true" focusable="false">
      {result === "pass" ? <path pathLength={1} d="m4 8.5 2.75 2.75L12 5.5" /> : null}
      {result === "fail" ? <path pathLength={1} d="m5 5 6 6M11 5l-6 6" /> : null}
      {result === "none" ? <path pathLength={1} d="M6.25 6.2a1.8 1.8 0 1 1 2.5 1.65c-.55.25-.75.6-.75 1.15M8 11v.25" strokeWidth="1.5" /> : null}
    </svg>
  );
}

/** One shape per state, so a chip never rests on colour alone. Pullback reuses the dip drawn for the qualifier. */
export function StateIcon({ state }: { state: KitState }) {
  switch (state) {
    case "setup":
      return <IconBandSetup />;
    case "watch":
      return <IconBandWatch />;
    case "pullback":
      return <IconDip />;
    case "wait":
      return <IconBandWait />;
    case "ignore":
      return <IconBandIgnore />;
    case "broken":
      return <IconBandBroken />;
    default:
      return <IconNoData />;
  }
}
