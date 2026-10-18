"use client";

import Link from "next/link";
import { StateChip } from "@/components/kit/state-chip";
import { kitState } from "@/components/kit/types";
import { ProfileFacts, profileName } from "@/components/public-profile";
import type { PublicHorizon } from "@/data/public-horizons";
import type { StoreRow } from "@/data/store";
import { toRow, byScore } from "@/components/view-model";
import type { Locale } from "@/i18n";
import { profileCopy } from "@/i18n/profile-messages";
import { useStateFilter } from "@/components/state-filter";
import styles from "./profile-lists.module.css";

export function ProfileLists({ locale, rows, horizons }: { locale: Locale; rows: StoreRow[]; horizons: Record<string, PublicHorizon> }) {
  const m = profileCopy[locale];
  const computed = Object.keys(horizons).length > 0;
  const { state } = useStateFilter();
  return <section className={styles.section} aria-label={m.title}>
    <h2>{m.title}</h2>
    <p>{m.description}</p>
    <div className={styles.lists}>
      {([ ["sustained", m.growers], ["event_driven", m.events] ] as const).map(([profile, title]) => {
        const items = rows.filter((row) => horizons[row.instrument.ticker]?.profile === profile).map((row) => toRow(locale, row)).filter((row) => state === "all" || row.state === state).sort(byScore);
        return <section className={styles.list} key={profile} aria-label={title}>
          <h3>{title}</h3>
          {!computed ? <p>{m.notComputed}</p> : items.length ? <div className={styles.scroll}><table className={styles.table}>
            <thead><tr><th scope="col">{m.ticker}</th><th scope="col">{m.status}</th><th scope="col">{m.profile}</th><th scope="col">{m.risk}</th></tr></thead>
            <tbody>{items.map((row) => <tr key={row.ticker}>
              <th scope="row"><Link href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link><span>{row.name}</span></th>
              <td><StateChip state={kitState(row.state, Boolean(row.pullbackLabel))} label={row.pullbackLabel ?? row.stateLabel} size="sm" /></td>
              <td>{profileName(locale, profile)}</td>
              <td><ProfileFacts locale={locale} horizon={horizons[row.ticker]} /></td>
            </tr>)}</tbody>
          </table></div> : <p>{m.empty}</p>}
        </section>;
      })}
    </div>
  </section>;
}
