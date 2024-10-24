import { Context, SupportedEvents } from "../types";
import { CallbackResult } from "../types/proxy";

/**

Contributor must open as draft first then ready it for review.
Context is: issue spec and PR diff
output: what's missing compared to the spec, review as requested changes and convert to draft. Pass = commented status.
conditions: 
- collaborator converts the PR, bot should not interact again
- one review per day
 */
export async function performPullPrecheck(
  context: Context<"pull_request.opened" | "pull_request.ready_for_review", SupportedEvents["pull_request.opened" | "pull_request.ready_for_review"]>
): Promise<CallbackResult> {
  const { logger, payload, eventName } = context
  const { pull_request } = payload

  if (pull_request.draft) {
    return { status: 200, reason: logger.info("PR is in draft mode, no action required").logMessage.raw };
  }

  // fetch the Task spec







  return { status: 200, reason: "success" };
}
