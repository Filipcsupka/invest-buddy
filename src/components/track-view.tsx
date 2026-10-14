"use client";
import { useEffect } from "react";
import { track, type AnalyticsEvent, type AnalyticsProps } from "@/analytics/events";

/** Sends one event when the page mounts. Renders nothing. */
export function TrackView({ events, props }: { events: AnalyticsEvent[]; props?: AnalyticsProps }) {
  useEffect(() => {
    for (const name of events) track(name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
