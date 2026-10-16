import type { ReactNode } from "react";

/** Sidebar icons: one 20px grid, 1.75 stroke, round caps. Drawn here, not from a font. */
const paths: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="6.5" height="8" rx="1.5" />
      <rect x="12" y="3" width="5" height="4.5" rx="1.5" />
      <rect x="3" y="13.5" width="6.5" height="3.5" rx="1.5" />
      <rect x="12" y="10" width="5" height="7" rx="1.5" />
    </>
  ),
  scanner: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.2 13.2 3.8 3.8" />
    </>
  ),
  heatmap: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>
  ),
  ideas: <path d="M10 2.8c-2.9 0-5 2.1-5 4.8 0 1.7.9 2.8 1.9 3.8.5.5.8 1 .8 1.8h4.6c0-.8.3-1.3.8-1.8 1-1 1.9-2.1 1.9-3.8 0-2.7-2.1-4.8-5-4.8ZM8 16.5h4" />,
  track: (
    <>
      <path d="M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 3.5v3h3" />
      <path d="M10 6.5V10l2.5 1.5" />
    </>
  ),
  insiders: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.8 16.5c.4-2.8 2.5-4.3 5.2-4.3s4.8 1.5 5.2 4.3M13.5 4.3a2.8 2.8 0 0 1 0 5.4M15 12.5c1.4.6 2.1 1.8 2.3 3.6" />
    </>
  ),
  portfolio: (
    <>
      <rect x="3" y="6" width="14" height="10.5" rx="2" />
      <path d="M7.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V6M3 10.5h14" />
    </>
  ),
  methodology: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12.5H5.5A1.5 1.5 0 0 0 4 17V4.5Z" />
      <path d="M4 17a1.5 1.5 0 0 0 1.5 1.5H16M8 7h4.5" />
    </>
  ),
  sizing: <path d="M4 5.5h5.5M13.5 5.5H16M4 10h2M10 10h6M4 14.5h7.5M15.5 14.5H16M11.5 3.5v4M8 8v4M13.5 12.5v4" />,
  pricing: (
    <>
      <path d="M10.4 3H16a1 1 0 0 1 1 1v5.6a1 1 0 0 1-.3.7l-6 6a1 1 0 0 1-1.4 0l-5.6-5.6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 .7-.3Z" />
      <circle cx="13.5" cy="6.5" r="1" />
    </>
  ),
  menu: <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
};

export function SideIcon({ name }: { name: string }) {
  return (
    <svg className="side-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name] ?? paths.dashboard}
    </svg>
  );
}
