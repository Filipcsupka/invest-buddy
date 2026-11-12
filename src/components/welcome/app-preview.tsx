import type { Locale } from "@/i18n";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { SideIcon } from "@/components/nav-icons";
import { flags } from "@/config/flags";
import { ChipTag, type Chip } from "./chip";
import s from "./story.module.css";

type Items = ReturnType<typeof getWelcomeStoryMessages>["areas"]["previewItems"];
type Groups = ReturnType<typeof getWelcomeStoryMessages>["areas"]["previewGroups"];

/**
 * The signed-in left panel as a customer sees it after sign-up. It lists the main entries and groups from the real app sidebar
 * (src/components/nav.tsx). Chips follow the licence gate and current plan access.
 * The page area beside it is drawn sample art, blurred, with no figures in it; nothing real is hidden behind the blur.
 */
function panel(): { group: keyof Groups; items: { key: keyof Items; icon: string; chip?: Chip }[] }[] {
  const f = flags();
  const vendorChip: Chip = process.env.EODHD_PRIVATE_USE === "on" ? "plus" : "free";
  return [
    { group: "dashboard", items: [{ key: "dashboard", icon: "dashboard", chip: vendorChip }] },
    {
      group: "stocks",
      items: [
        { key: "stocks", icon: "scanner", chip: vendorChip },
        { key: "heatmap", icon: "heatmap", chip: vendorChip },
        { key: "record", icon: "track", chip: vendorChip },
        { key: "portfolio", icon: "portfolio", chip: vendorChip },
        ...(f.INSIDERS_PAGE && !f.MARKETS_VIEWS ? [{ key: "insiders" as const, icon: "insiders", chip: vendorChip }] : []),
      ],
    },
    { group: "etfs", items: [{ key: "etfResearch", icon: "scanner", chip: "plus" }, { key: "etfRecord", icon: "track", chip: "plus" }] },
    ...(f.MARKETS_VIEWS ? [
      { group: "indices" as const, items: [{ key: "indices" as const, icon: "indices", chip: "plus" as const }] },
      { group: "markets" as const, items: [
        { key: "economy" as const, icon: "economy", chip: "plus" as const },
        { key: "calendar" as const, icon: "economy", chip: "plus" as const },
        { key: "news" as const, icon: "news", chip: "plus" as const },
        { key: "congress" as const, icon: "congress", chip: "plus" as const },
        ...(f.INSIDERS_PAGE ? [{ key: "insiders" as const, icon: "insiders", chip: "plus" as const }] : []),
        { key: "screener" as const, icon: "scanner", chip: "plus" as const },
      ] },
    ] : []),
    { group: "learn", items: [{ key: "method", icon: "methodology", chip: "open" }, { key: "pricing", icon: "pricing", chip: "open" }] },
    { group: "later", items: [{ key: "myPortfolio", icon: "portfolio" }] },
  ];
}

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
          {panel().map((group) => [
            <p key={`${group.group}-label`}>{t.previewGroups[group.group]}</p>,
            <ul key={group.group}>
              {group.items.map((item, i) => (
                <li key={item.key} data-current={group.group === "dashboard" && i === 0 ? "" : undefined} data-later={group.group === "later" ? "" : undefined}>
                  <SideIcon name={item.icon} />
                  {t.previewItems[item.key]}
                  {item.chip ? <ChipTag chip={item.chip} label={t.chips[item.chip]} /> : null}
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
