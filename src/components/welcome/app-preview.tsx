import type { Locale } from "@/i18n";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { ChipTag, type Chip } from "./chip";
import s from "./story.module.css";

type Items = ReturnType<typeof getWelcomeStoryMessages>["areas"]["previewItems"];
type Groups = ReturnType<typeof getWelcomeStoryMessages>["areas"]["previewGroups"];

/**
 * The signed-in left panel as a customer sees it after sign-up: every area with its status chip. Chips follow src/config/tiers.ts and
 * the area status on this page: Free account, Plus, Opens soon. The page area beside it is drawn sample art, blurred, with no figures
 * in it; nothing real is hidden behind the blur (funnel-design s3: blur only static sample art).
 */
const PANEL: { group: keyof Groups; items: { key: keyof Items; chip: Chip }[] }[] = [
  {
    group: "stocks",
    items: [
      { key: "dashboard", chip: "free" },
      { key: "scanner", chip: "free" },
      { key: "heatmap", chip: "free" },
      { key: "company", chip: "free" },
      { key: "history", chip: "plus" },
      { key: "insiders", chip: "soon" },
      { key: "record", chip: "soon" },
      { key: "method", chip: "open" },
    ],
  },
  { group: "etfs", items: [{ key: "etfResearch", chip: "soon" }, { key: "etfRecord", chip: "soon" }] },
  { group: "markets", items: [{ key: "indices", chip: "soon" }, { key: "economy", chip: "soon" }, { key: "news", chip: "soon" }] },
  { group: "you", items: [{ key: "watchlist", chip: "free" }, { key: "alerts", chip: "free" }, { key: "export", chip: "plus" }] },
];

/** The brand tile, drawn small for the mock panel (same shapes as the shell's BrandMark). */
const Mark = () => (
  <svg width="22" height="22" viewBox="0 0 30 30" aria-hidden="true" focusable="false">
    <rect width="30" height="30" rx="8" fill="currentColor" opacity="0.14" />
    <rect x="6.5" y="15" width="4.5" height="8.5" rx="1.5" fill="currentColor" />
    <rect x="12.75" y="10.5" width="4.5" height="13" rx="1.5" fill="currentColor" />
    <rect x="19" y="6" width="4.5" height="17.5" rx="1.5" fill="var(--accent)" />
  </svg>
);

export function AppPreview({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).areas;
  return (
    <figure className={s.preview} aria-labelledby="preview-title">
      <div className={s.window}>
        <div className={s.panel}>
          <p><Mark />InvestBuddy</p>
          {PANEL.map((group) => [
            <p key={`${group.group}-label`}>{t.previewGroups[group.group]}</p>,
            <ul key={group.group}>
              {group.items.map((item, i) => (
                <li key={item.key} data-current={group.group === "stocks" && i === 0 ? "" : undefined}>
                  {t.previewItems[item.key]}
                  <ChipTag chip={item.chip} label={t.chips[item.chip]} />
                </li>
              ))}
            </ul>,
          ])}
          <p>{t.previewSignedIn}</p>
        </div>
        {/* Sample art only: shapes, no text and no figures. */}
        <div className={s.canvas} aria-hidden="true">
          <div><i /><i /><b /><b /><b />{["setup", "watch", "watch", "wait", "ignore", "broken"].map((band, i) => <u key={i} data-state={band} />)}</div>
          <span className="stamp">{t.previewStamp}</span>
        </div>
      </div>
      <figcaption>
        <strong id="preview-title">{t.previewTitle}</strong>
        {t.previewLede}
      </figcaption>
    </figure>
  );
}
