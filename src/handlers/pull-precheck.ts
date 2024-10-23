import { Context, SupportedEvents } from "../types";

export async function performPullPrecheck(
  context: Context<"pull_request.opened" | "pull_request.ready_for_review", SupportedEvents["pull_request.opened" | "pull_request.ready_for_review"]>
) {}
