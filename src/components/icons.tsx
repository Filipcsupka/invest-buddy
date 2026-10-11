import type { SVGProps } from "react";

/** One 16px grid, 1.5 stroke, square caps: the line weight of the drawing sheet. */
type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...props }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} focusable="false" className="icon" {...props}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
  </Icon>
);

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3.5 3.5" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
  </Icon>
);

export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 8h-10M7 4.5 3.5 8 7 11.5" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Icon>
);

export const IconCross = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

/** A notch in a rising line: the pullback qualifier. */
export const IconDip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.5 12 6 6.5l2.5 3L14.5 3" />
    <path d="M6 6.5v6.5M8.5 9.5V13" strokeDasharray="1.5 1.5" />
  </Icon>
);

export const IconSort = ({ direction, ...p }: IconProps & { direction: "ascending" | "descending" | "none" }) => (
  <Icon {...p}>
    <path d="M5 6.5 8 3.5l3 3" opacity={direction === "descending" ? 0.3 : 1} />
    <path d="M5 9.5 8 12.5l3-3" opacity={direction === "ascending" ? 0.3 : 1} />
  </Icon>
);

export const IconReset = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8a5 5 0 1 0 1.5-3.5" />
    <path d="M4.5 1.5v3h3" />
  </Icon>
);

/** Dashed circle with a question mark: no data. */
export const IconNoData = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
    <path d="M6.3 6.4a1.8 1.8 0 1 1 2.5 1.7c-.6.3-.8.7-.8 1.2M8 11.4v.1" />
  </Icon>
);

/** Band shapes for the status slider, so a band never rests on colour alone. */
export const IconBandBroken = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 1.5h6L14.5 5v6L11 14.5H5L1.5 11V5z" />
    <path d="m4.5 11.5 7-7" />
  </Icon>
);
export const IconBandIgnore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5 8h6" />
  </Icon>
);
export const IconBandWait = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 2h8M4 14h8M4.5 2c0 3.5 3.5 4 3.5 6s-3.5 2.5-3.5 6M11.5 2c0 3.5-3.5 4-3.5 6s3.5 2.5 3.5 6" />
  </Icon>
);
export const IconBandWatch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1 8s2.5-4.5 7-4.500S15 8 15 8s-2.5 4.5-7 4.500S1 8 1 8z" />
    <circle cx="8" cy="8" r="1.8" />
  </Icon>
);
export const IconBandSetup = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.2 8.3 2 2 3.6-4" />
  </Icon>
);
