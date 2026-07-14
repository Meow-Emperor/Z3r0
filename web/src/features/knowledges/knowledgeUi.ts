import type { KnowledgeDocumentStatus } from "../../shared/api/types";

export const KNOWLEDGE_STATUS_COLORS: Record<
  KnowledgeDocumentStatus,
  "blue" | "cyan" | "amber" | "green" | "red" | "grey"
> = {
  pending: "grey",
  parsing: "blue",
  analyzing: "cyan",
  processing: "amber",
  processed: "green",
  failed: "red",
};
