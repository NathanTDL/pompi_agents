import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep presence", { minutes: 10 }, internal.presence.sweep, {});
// Every minute, so a computer stops within a minute of its 7 idle ones.
crons.interval("stop idle computers", { minutes: 1 }, internal.computer.sweep, {});

export default crons;
