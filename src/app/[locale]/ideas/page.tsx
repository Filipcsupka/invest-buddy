import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Disclaimer } from "@/components/disclaimer";
import { IdeaCard } from "@/components/idea-card";
import { SampleStamp } from "@/components/operator-disclosure";
import { ideasEnabled, latestIdeas } from "@/data/ideas-store";
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
  if (!ideasEnabled()) notFound();
  const m = getMessages(locale);
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
      {data.rows.length ? (
        <div role="list" aria-label={m.ideas.listLabel} style={{ display: "grid", gap: "var(--s5)" }}>
          {data.rows.map((idea) => <div role="listitem" key={idea.id}><IdeaCard idea={idea} locale={locale} /></div>)}
        </div>
      ) : (
        <p className="empty-line">{m.ideas.empty}</p>
      )}
    </div>
  );
}

export default withPageLog("/ideas", Ideas);
