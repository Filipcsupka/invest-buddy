import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "./web-cache";

/** Marks the cached reads for these tags stale so the next request reads the database. Never throws. */
export function purgeWebCache(tags: string[] = [CACHE_TAGS.scores, CACHE_TAGS.ideas, CACHE_TAGS.portfolio]): boolean {
  try {
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
    return true;
  } catch {
    return false;
  }
}
