import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep presence", { minutes: 10 }, internal.presence.sweep, {});
// Every minute, so a computer stops within a minute of its 7 idle ones.
crons.interval("stop idle computers", { minutes: 1 }, internal.computer.sweep, {});

// Daily: computers unused for 30 days are deleted, so they stop costing storage.
crons.daily("delete forgotten computers", { hourUTC: 4, minuteUTC: 0 }, internal.computer.forget, {});

// Hourly: the "your trial ends tomorrow" email. Daily: computers of trials that ended a week ago without a plan.
crons.hourly("remind trials ending", { minuteUTC: 15 }, internal.billing.remind, {});
crons.daily("clear ended trials", { hourUTC: 4, minuteUTC: 30 }, internal.billing.clearEnded, {});

// Every two minutes: agents' work whose action died carries on from its last checkpoint (brain.ts).
crons.interval("recover interrupted agent work", { minutes: 2 }, internal.brain.recover, {});

// Every minute: routines that are due start (routines.ts).
crons.interval("run due routines", { minutes: 1 }, internal.routines.tick, {});

// Daily: agents' saved work that nobody carried on for a week (agent.ts).
crons.daily("forget old agent runs", { hourUTC: 5, minuteUTC: 0 }, internal.brain.forgetRuns, {});

export default crons;
