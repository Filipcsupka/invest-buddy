import { afterEach, describe, expect, it, vi } from "vitest";
import { runLoggedJob } from "./job-log";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

describe("job lifecycle logging", () => {
  it("records start, end, duration and counts", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    await runLoggedJob("daily", async () => ({ instruments: 35, failures: 0 }));
    const [start, end] = lines.map((line) => JSON.parse(line));
    expect(start).toMatchObject({ event: "job_start", job: "daily" });
    expect(end).toMatchObject({ event: "job_end", job: "daily", status: "ok", counts: { instruments: 35, failures: 0 } });
    expect(end.runId).toBe(start.runId);
    expect(end.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a failed end without an error message", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
    await runLoggedJob("collect", async () => { throw new Error("secret-token"); });
    expect(JSON.parse(lines[0])).toMatchObject({ event: "job_end", job: "collect", status: "failed", failures: 1 });
    expect(lines.join("")).not.toContain("secret-token");
    expect(process.exitCode).toBe(1);
  });
});
