import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { webhook as polarWebhook } from "./billing";
import { incoming } from "./email";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Mail to the agents (AgentMail's webhook).
http.route({ path: "/agentmail", method: "POST", handler: incoming });

// Subscriptions from Polar (its webhook), for plans (billing.ts).
http.route({ path: "/polar/events", method: "POST", handler: polarWebhook });

export default http;
