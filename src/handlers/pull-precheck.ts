import { PULL_PRECHECK_SYSTEM_MESSAGE } from "../adapters/openai/helpers/prompts";
import { collectIssuesToBeClosedByThisPr } from "../helpers/gql-functions";
import { fetchPullRequestDiff } from "../helpers/issue-fetching";
import { Context, SupportedEvents } from "../types";
import { CallbackResult } from "../types/proxy";
import { handleLlmQueryOutput } from "./llm-query-output";

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
  const {
    logger,
    payload,
    config: { model },
    env: { UBIQUITY_OS_APP_NAME },
  } = context;
  const {
    pull_request,
    repository: {
      owner: { login: repoOwner },
      name: repoName,
    },
  } = payload;

  if (pull_request.draft) {
    return { status: 200, reason: logger.info("PR is in draft mode, no action required").logMessage.raw };
  }

  const closingIssues = await collectIssuesToBeClosedByThisPr(context.octokit, {
    owner: pull_request.base.repo.owner.login,
    repo: pull_request.base.repo.name,
    issue_number: pull_request.number,
  });

  if (closingIssues.length === 0) {
    throw logger.error("This pull request does not have an linked task, please link one before merging.");
  }

  if (closingIssues.length > 1) {
    // May require some sort of elegant handling
  }

  const taskSpec = closingIssues[0].body;
  if (!taskSpec) {
    throw logger.error("Task Spec not found, please link one before merging.");
  }

  const prDiff = await fetchPullRequestDiff(context, repoOwner, repoName, pull_request.number);
  if (!prDiff) {
    throw logger.error("PR Diff not found");
  }

  const question = "What's missing compared to the spec?";
  const additionalContext: string[] = [prDiff, taskSpec];
  const localContext: string[] = [];
  /**
   * These should be dynamic on every query
   */
  const groundTruths: string[] = [];

  const llmResponse = await context.adapters.openai.completions.createCompletion(
    PULL_PRECHECK_SYSTEM_MESSAGE,
    question,
    model,
    additionalContext,
    localContext,
    groundTruths,
    UBIQUITY_OS_APP_NAME
  );

  return handleLlmQueryOutput(context, llmResponse);
}
