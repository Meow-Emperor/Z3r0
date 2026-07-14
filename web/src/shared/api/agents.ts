import { defineJsonEndpoint } from "./client";
import type { ListAgentsResponse } from "./types";

const AGENTS_PATH = "/api/agents";

export const listAgents = defineJsonEndpoint<[], ListAgentsResponse>("GET", () => AGENTS_PATH);
