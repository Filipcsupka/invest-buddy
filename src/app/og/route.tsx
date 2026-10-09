import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/** Link preview image, same for both languages: the site mark and name, no copy to translate. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px", background: "#eceeeb", color: "#15191c" }}>
        <svg width="320" height="320" viewBox="0 0 32 32" style={{ marginBottom: 24 }}>
          <rect x="3.75" y="12.75" width="11" height="6.5" fill="#15191c" stroke="#15191c" strokeWidth="1.5" />
          <rect x="16.75" y="12.75" width="7" height="6.5" fill="none" stroke="#15191c" strokeWidth="1.5" />
          <rect x="25.5" y="12" width="3.5" height="8" fill="#2340c4" />
        </svg>
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -2 }}>InvestBuddy</div>
        <div style={{ fontSize: 34, color: "#4a5550", marginTop: 12 }}>invest.filipcsupka.online</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
