import type { Locale, Messages } from "@/i18n";
import { TrackView } from "./track-view";
import type { ConfirmView, UnsubscribeView } from "@/waitlist/states";

type Labels = Messages["waitlist"];

function Panel({ title, body, locale, labels, form }: { title: string; body: string; locale: Locale; labels: Labels; form?: { action: string; token: string; button: string } }) {
  return (
    <article className="frame page reading">
      <header className="page-head">
        <h1 className="title">{title}</h1>
        <p className="prose">{body}</p>
      </header>
      {form ? (
        // A plain form post, so the page works without script and a link scanner that only opens the link changes nothing.
        <form method="post" action={form.action} className="actions">
          <input type="hidden" name="token" value={form.token} />
          <input type="hidden" name="locale" value={locale} />
          <button className="button" type="submit">{form.button}</button>
        </form>
      ) : (
        <p className="actions"><a className="button secondary" href={`/${locale}`}>{labels.backHome}</a></p>
      )}
    </article>
  );
}

export function ConfirmPanel({ locale, labels, view, token }: { locale: Locale; labels: Labels; view: ConfirmView; token: string }) {
  switch (view) {
    case "button": return <Panel locale={locale} labels={labels} title={labels.confirmTitle} body={labels.confirmBody} form={{ action: "/api/waitlist/confirm", token, button: labels.confirmButton }} />;
    case "confirmed": return <><Panel locale={locale} labels={labels} title={labels.confirmedTitle} body={labels.confirmedBody} /><TrackView events={["waitlist_confirm"]} props={{ locale }} /></>;
    case "already": return <Panel locale={locale} labels={labels} title={labels.confirmedTitle} body={labels.alreadyBody} />;
    case "expired": return <Panel locale={locale} labels={labels} title={labels.expiredTitle} body={labels.expiredBody} />;
    default: return <Panel locale={locale} labels={labels} title={labels.invalidTitle} body={labels.invalidBody} />;
  }
}

export function UnsubscribePanel({ locale, labels, view, token }: { locale: Locale; labels: Labels; view: UnsubscribeView; token: string }) {
  switch (view) {
    case "button": return <Panel locale={locale} labels={labels} title={labels.unsubscribeTitle} body={labels.unsubscribeBody} form={{ action: "/api/waitlist/unsubscribe", token, button: labels.unsubscribeButton }} />;
    case "unsubscribed":
    case "already": return <Panel locale={locale} labels={labels} title={labels.unsubscribedTitle} body={labels.unsubscribedBody} />;
    default: return <Panel locale={locale} labels={labels} title={labels.invalidTitle} body={labels.invalidBody} />;
  }
}
