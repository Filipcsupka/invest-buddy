import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordCard, RecordHead } from "@/components/record-parts";
import "@/components/record-pages.css";
import { MacroEvents } from "@/components/macro-events";
import { storedMacroEvents } from "@/data/macro-calendar-store";
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
  const macroSchedule = await storedMacroEvents(new Date().toISOString().slice(0, 10));
  return (
    <div className="frame page">
      <RecordHead
        title={m.ideas.title}
        lede={m.ideas.lede}
        stamp={data.sample && <SampleStamp text={m.common.sample} />}
        meta={<><span className="rp-pill">{m.ideas.rulesNote}</span><Disclaimer text={m.common.disclaimer} /></>}
      />
      <MacroEvents locale={locale} schedule={macroSchedule} />
      <PaywallSegment id="ideas-list" viewer={viewer} locale={locale} detail={data.rows.length ? ideasCountText(locale, data.rows.length) : undefined}>
        <RecordCard id="ideas-feed" title={m.ideas.listLabel} meta={data.rows.length ? ideasCountText(locale, data.rows.length) : undefined} className="rp-bare">
          {data.rows.length ? (
            <div role="list" aria-label={m.ideas.listLabel} className="rp-ideas">
              {data.rows.map((idea) => <div role="listitem" key={idea.id}><IdeaCard idea={idea} locale={locale} showAmounts={false} /></div>)}
            </div>
          ) : (
            <p className="rp-empty">{m.ideas.empty}</p>
          )}
        </RecordCard>
      </PaywallSegment>
    </div>
  );
}

export default withPageLog("/ideas", Ideas);
