/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentmail from "../agentmail.js";
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as boards from "../boards.js";
import type * as brain from "../brain.js";
import type * as composio from "../composio.js";
import type * as computer from "../computer.js";
import type * as computerUse from "../computerUse.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as lib from "../lib.js";
import type * as orgo from "../orgo.js";
import type * as presence from "../presence.js";
import type * as templates from "../templates.js";
import type * as toolUse from "../toolUse.js";
import type * as users from "../users.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentmail: typeof agentmail;
  agents: typeof agents;
  ai: typeof ai;
  boards: typeof boards;
  brain: typeof brain;
  composio: typeof composio;
  computer: typeof computer;
  computerUse: typeof computerUse;
  config: typeof config;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  items: typeof items;
  lib: typeof lib;
  orgo: typeof orgo;
  presence: typeof presence;
  templates: typeof templates;
  toolUse: typeof toolUse;
  users: typeof users;
  voice: typeof voice;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
