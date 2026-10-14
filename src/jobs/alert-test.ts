import { alertNotifierFromEnv, sendAlert } from "../notify/notifier";
import { runLoggedJob } from "./job-log";

/** One-off: sends a test alert so the owner can confirm the channel works. Needs TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID. */
async function main() {
  await runLoggedJob("alert-test", async () => {
    const notifier = alertNotifierFromEnv();
    if (!notifier) { process.exitCode = 1; return { sent: 0, failures: 1 }; }
    const at = new Date().toISOString();
    const ok = await sendAlert(notifier, { channel: "telegram", subject: "invest-buddy test alert", body: `Sent at ${at}. If you read this, alerts reach you.` });
    if (!ok) process.exitCode = 1;
    return { sent: ok ? 1 : 0, failures: ok ? 0 : 1 };
  });
}

void main();
