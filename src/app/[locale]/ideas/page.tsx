import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MacroEvents } from "@/components/macro-events";
import { Disclaimer } from "@/components/disclaimer";
import { IdeaCard } from "@/components/idea-card";
import { SampleStamp } from "@/components/operator-disclosure";
import { ideasEnabled, latestIdeas } from "@/data/ideas-store";
import { PaywallSegment } from "@/components/paywall-segment";
import { flags } from "@/config/flags";
import { ideasCountText } from "@/i18n/tier-lists-messages";
import { getViewer } from "@/viewer/get-viewer";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/ideas", m.meta.ideasTitle, m.meta.ideasDescription);
}

async function Ideas({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  if (!ideasEnabled() || !flags().ADVICE_OUTPUT) notFound();
  const m = getMessages(locale);
  const viewer = await getViewer();
  const data = await latestIdeas();
  return (
    <div className="frame page">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{m.ideas.title}</h1>
          {data.sample && <SampleStamp text={m.common.sample} />}
        </div>
        <p className="lede">{m.ideas.lede}</p>
        <p className="muted small">{m.ideas.rulesNote}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>
      <MacroEvents locale={locale} />
      <PaywallSegment id="ideas-list" viewer={viewer} locale={locale} detail={data.rows.length ? ideasCountText(locale, data.rows.length) : undefined}>
        {data.rows.length ? (
          <div role="list" aria-label={m.ideas.listLabel} style={{ display: "grid", gap: "var(--s5)" }}>
            {data.rows.map((idea) => <div role="listitem" key={idea.id}><IdeaCard idea={idea} locale={locale} showAmounts={false} /></div>)}
          </div>
        ) : (
          <p className="empty-line">{m.ideas.empty}</p>
        )}
      </PaywallSegment>
    </div>
  );
}

export default withPageLog("/ideas", Ideas);
