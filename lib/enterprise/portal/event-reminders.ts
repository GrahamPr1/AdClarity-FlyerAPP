import { Redis } from "@upstash/redis"
import { sendEventAgentReminder, sendEventReminder } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { listAgentLeads, updateAgentLead } from "./agent-data"
import { eventLink, eventPageFor, eventsStartingBetween, formatEventWhen, localDate, markAgentReminded } from "./events"

// The day-before event reminder. Daily (Vercel cron, vercel.json, 14:00 UTC:
// morning in every US zone) through /api/cron/nop-event-reminders. For every
// open event whose date is TOMORROW in its own time zone, everyone who RSVP'd
// with an email gets one reminder, in the language they used. Each RSVP is
// marked (reminderSentAt), so a rerun never sends twice. The agent gets one
// email too, in their language, with the whole RSVP list (the event is marked
// agentReminderSentAt). A cancelled or hidden event, or one whose agent is no
// longer active with events, gets none.
//
//   nop-event-reminder-runs    list, newest first, last 50 runs (counts only)

const redis = Redis.fromEnv()
const RUNS_KEY = "nop-event-reminder-runs"

export interface ReminderRun {
  at: string
  events: number
  sent: number
  failed: number
  /** RSVPs without an email: nothing to send them. */
  noEmail: number
  /** Agents sent their RSVP list. */
  agentSent: number
}

export async function runEventReminders(now = new Date()): Promise<ReminderRun> {
  const run: ReminderRun = { at: now.toISOString(), events: 0, sent: 0, failed: 0, noEmail: 0, agentSent: 0 }
  const soon = await eventsStartingBetween(now, new Date(now.getTime() + 48 * 3600_000))
  for (const event of soon) {
    const tomorrow = localDate(new Date(now.getTime() + 24 * 3600_000), event.timezone)
    if (event.date !== tomorrow) continue
    const page = await eventPageFor(event.code, now)
    if (!page || page.state !== "open") continue
    run.events++
    const rsvps = (await listAgentLeads(event.agentId)).filter((l) => l.eventId === event.id && !l.reminderSentAt)
    for (const rsvp of rsvps) {
      if (!rsvp.email) {
        run.noEmail++
        continue
      }
      const lang = rsvp.consent?.lang ?? "en"
      const out = await sendEventReminder({
        to: rsvp.email, lang, firstName: rsvp.name.trim().split(/\s+/)[0], title: event.title, when: formatEventWhen(event, lang),
        place: [event.locationName, event.address].filter(Boolean).join(", "), agentName: page.agentName, agentPhone: page.phone, agentEmail: page.email, pageUrl: eventLink(event.code),
      })
      if (out.sent) {
        run.sent++
        await updateAgentLead(event.agentId, { ...rsvp, reminderSentAt: now.toISOString() })
      } else {
        run.failed++
        console.error(`[nop-events] reminder for RSVP ${rsvp.id} failed:`, out.reason)
      }
    }
    if (!event.agentReminderSentAt) {
      const all = (await listAgentLeads(event.agentId)).filter((l) => l.eventId === event.id).reverse()
      const out = await sendEventAgentReminder({
        to: page.owner, lang: page.agentLang, title: event.title, when: formatEventWhen(event, page.agentLang),
        place: [event.locationName, event.address].filter(Boolean).join(", "),
        rsvps: all.map((l) => ({ name: l.name, phone: l.phone, email: l.email, guests: l.guests ?? 0 })),
        eventUrl: `${CANONICAL_SITE_URL}/agent/events/${event.id}`,
      })
      if (out.sent) {
        run.agentSent++
        await markAgentReminded(event.id, now)
      } else {
        run.failed++
        console.error(`[nop-events] agent reminder for event ${event.id} failed:`, out.reason)
      }
    }
  }
  await redis.lpush(RUNS_KEY, run)
  await redis.ltrim(RUNS_KEY, 0, 49)
  console.log(`[nop-events] reminders: ${run.events} event(s) tomorrow, ${run.sent} sent, ${run.failed} failed, ${run.noEmail} without email, ${run.agentSent} agent list(s)`)
  return run
}
