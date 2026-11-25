/**
 * Pompi's plans and what each includes a month (billing.ts enforces them; the
 * landing page and the app show them). Without a plan, agents don't work.
 */

export type PlanKey = "none" | "trial" | "solo" | "pro" | "max";
export type PaidPlan = Exclude<PlanKey, "none" | "trial">;

export type Plan = { name: string; price: number; answers: number; computerTasks: number; emailAgents: number; blurb: string };

/**
 * The free trial: everyone gets one, without a card. Its clock starts at the
 * first request to an agent; what it includes is for the whole trial, not a month.
 */
export const TRIAL_MS = 3 * 24 * 60 * 60_000;

export const PLANS: Record<PlanKey, Plan> = {
  none: { name: "No plan", price: 0, answers: 0, computerTasks: 0, emailAgents: 0, blurb: "" },
  trial: { name: "Free trial", price: 0, answers: 40, computerTasks: 3, emailAgents: 0, blurb: "Three days with your AI team, on us." },
  solo: { name: "Solo", price: 19, answers: 150, computerTasks: 10, emailAgents: 1, blurb: "For trying your AI team on real work." },
  pro: { name: "Pro", price: 59, answers: 500, computerTasks: 40, emailAgents: 3, blurb: "For running your work with agents every day." },
  max: { name: "Max", price: 100, answers: 1000, computerTasks: 80, emailAgents: 5, blurb: "For heavy use, with the most computer time." },
};

export const PAID_PLANS: PaidPlan[] = ["solo", "pro", "max"];

/** What a plan includes, as lines for a pricing card. */
export const features = (p: Plan) => [
  `${p.answers.toLocaleString("en-US")} agent answers a month`,
  `${p.computerTasks} computer tasks a month`,
  `${p.emailAgents} agent${p.emailAgents > 1 ? "s" : ""} with their own email`,
  "Your own cloud computer",
  "Unlimited boards, agents and teammates",
];
