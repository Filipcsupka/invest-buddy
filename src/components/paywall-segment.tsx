import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { PaywallSegmentId } from "../paywall/segments";

/** A single element keeps its DOM position; text and multiple children need one marker wrapper. */
export function PaywallSegment({ id, children }: { id: PaywallSegmentId; children: ReactNode }) {
  if (isValidElement(children)) {
    return cloneElement(children as ReactElement<{ "data-paywall-candidate"?: string }>, { "data-paywall-candidate": id });
  }
  return <div data-paywall-candidate={id}>{children}</div>;
}
