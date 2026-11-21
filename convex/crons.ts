import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep presence", { minutes: 10 }, internal.presence.sweep, {});
// Every minute, so a computer stops within a minute of its 7 idle ones.
crons.interval("stop idle computers", { minutes: 1 }, internal.computer.sweep, {});

// Daily: computers unused for 30 days are deleted, so they stop costing storage.
crons.daily("delete forgotten computers", { hourUTC: 4, minuteUTC: 0 }, internal.computer.forget, {});

export default crons;
