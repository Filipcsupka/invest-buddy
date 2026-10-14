import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

// Tokens from DESIGN.md (light theme). Fonts: next/og bundles its default font in the package,
// so nothing is read from disk at run time (the runtime image has a read-only root filesystem). Only Geist Regular is bundled, so no bold weight is used.
const ink = "#15191c", ink2 = "#464f56", ground = "#eceeeb", rule = "#c7cdcc", signal = "#2340c4";

const mark = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <rect x="3.75" y="12.75" width="11" height="6.5" fill={ink} stroke={ink} strokeWidth="1.5" />
    <rect x="16.75" y="12.75" width="7" height="6.5" fill="none" stroke={ink} strokeWidth="1.5" />
    <rect x="25.5" y="12" width="3.5" height="8" fill={signal} />
  </svg>
);

export interface HomeCard { siteName: string; tagline: string }
export interface CompanyCard { siteName: string; ticker: string; name: string; score: string; state: string; date: string; disclaimer: string; badge?: string }

const frame = { width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 80px", background: ground, color: ink } as const;
const cache = { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" };

export function homeImage({ siteName, tagline }: HomeCard) {
  return new ImageResponse(
    (
      <div style={{ ...frame, justifyContent: "center" }}>
        <div style={{ display: "flex", marginBottom: 24 }}>{mark(240)}</div>
        <div style={{ fontSize: 104, letterSpacing: -2 }}>{siteName}</div>
        <div style={{ fontSize: 36, color: ink2, marginTop: 16 }}>{tagline}</div>
      </div>
    ),
    { ...OG_SIZE, headers: cache },
  );
}

/** Ticker, name, score, rule state and session date. No action, size or tier text, whatever ADVICE_OUTPUT says. */
export function companyImage({ siteName, ticker, name, score, state, date, disclaimer, badge }: CompanyCard) {
  return new ImageResponse(
    (
      <div style={frame}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, color: ink2 }}>
          {mark(56)}
          <span>{siteName}</span>
          {badge && <span style={{ marginLeft: "auto", fontSize: 28, color: signal, border: `2px solid ${signal}`, padding: "4px 16px" }}>{badge}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 56, color: ink2, marginBottom: 16 }}>{name === ticker ? "" : name}</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: `2px solid ${rule}`, paddingBottom: 24 }}>
            <div style={{ fontSize: 176, letterSpacing: -4, lineHeight: 1 }}>{ticker}</div>
            <div style={{ fontSize: /\d/.test(score) ? 152 : 56, color: signal, lineHeight: 1, whiteSpace: "nowrap" }}>{score}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 40, marginTop: 24 }}>
            <span>{state}</span>
            <span style={{ color: ink2 }}>{date}</span>
          </div>
        </div>
        <div style={{ fontSize: 24, color: ink2 }}>{disclaimer}</div>
      </div>
    ),
    { ...OG_SIZE, headers: cache },
  );
}
