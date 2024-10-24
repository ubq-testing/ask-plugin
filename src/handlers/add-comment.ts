import { getIssueNumberFromPayload } from "../helpers/get-issue-no-from-payload";
import { Context } from "../types/context";

/**
 * Add a comment to an issue
 * @param context - The context object containing environment and configuration details
 * @param message - The message to add as a comment
 */
export async function addCommentToIssue(context: Context, message: string) {
  const { payload } = context;
  const issueNumber = getIssueNumberFromPayload(payload);

  try {
    await context.octokit.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: issueNumber,
      body: message,
    });
  } catch (e: unknown) {
    context.logger.error("Adding a comment failed!", { e });
  }
}
