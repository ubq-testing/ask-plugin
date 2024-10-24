import { PULL_PRECHECK_SYSTEM_MESSAGE } from "../adapters/openai/helpers/prompts";
import { checkIfPrClosesIssues } from "../helpers/gql-functions";
import { fetchIssue, fetchPullRequestDiff } from "../helpers/issue-fetching";
import { Context, SupportedEvents } from "../types";
import { CallbackResult } from "../types/proxy";
import { findGroundTruths } from "./find-ground-truths";
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

  const { issues: closingIssues } = await checkIfPrClosesIssues(context.octokit, {
    owner: pull_request.base.repo.owner.login,
    repo: pull_request.base.repo.name,
    pr_number: pull_request.number,
  });

  let taskSpec;
  let owner, repo, issueNumber;

  if (closingIssues.length === 0) {
    const linkedViaBodyHash = pull_request.body?.match(/#(\d+)/g);
    const urlMatch = getOwnerRepoIssueNumberFromUrl(pull_request.body);

    if (linkedViaBodyHash?.length) {
      const issueNumber = linkedViaBodyHash[0].replace("#", "");
      const issue = await fetchIssue({ context, owner: repoOwner, repo: repoName, issueNum: Number(issueNumber) });
      if (!issue) {
        throw logger.error("This pull request does not have an linked task, please link one before merging.");
      }

      taskSpec = issue.body;
    }

    if (urlMatch && !taskSpec) {
      owner = urlMatch.owner;
      repo = urlMatch.repo;
      issueNumber = urlMatch.issueNumber;
      const issue = await fetchIssue({ context, owner, repo, issueNum: Number(issueNumber) });
      if (!issue) {
        throw logger.error("This pull request does not have an linked task, please link one before merging.");
      }

      taskSpec = issue.body;
    }
  } else if (closingIssues.length > 1) {
    throw logger.error("Multiple tasks linked to this PR, needs investigated to see how best to handle it.", {
      closingIssues,
      pull_request,
    });
  } else {
    taskSpec = closingIssues[0].body;
  }

  if (!taskSpec) {
    throw logger.error("Task Spec not found, please link one before merging.");
  }

  const tempOwner = "ubiquity-os-marketplace";
  const tempRepo = "command-ask";
  const tempIssueNumber = 11;
  const prDiff = await fetchPullRequestDiff(context, tempOwner, tempRepo, tempIssueNumber);
  if (!prDiff) {
    throw logger.error("PR Diff not found");
  }

  const question = "What's missing compared to the spec?";
  const additionalContext: string[] = [prDiff, taskSpec];
  const localContext: string[] = [];
  /**
   * These should be dynamic on every query imo not just here.
   */
  const groundTruths: string[] = await findGroundTruths(context, taskSpec);

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

function getOwnerRepoIssueNumberFromUrl(body: string | undefined | null): { owner: string; repo: string; issueNumber: string } | null {
  if (!body) return null;

  const regex = /https:\/\/(www\.)?github.com\/(?<owner>[\w-]+)\/(?<repo>[\w-]+)\/issues\/(?<issueNumber>\d+)/i;
  const match = body.match(regex);

  if (match && match.groups) {
    const { owner, repo, issueNumber } = match.groups;
    return { owner, repo, issueNumber };
  }

  return null;
}
