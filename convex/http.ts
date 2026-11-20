import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { incoming } from "./email";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Mail to the agents (AgentMail's webhook).
http.route({ path: "/agentmail", method: "POST", handler: incoming });

export default http;
