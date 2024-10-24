import { Context } from "../types";
import { FetchParams } from "../types/github-types";
import { logger } from "./errors";

export function getIssueNumberFromPayload(payload: Context["payload"], fetchParams?: FetchParams): number {
  let issueNumber, owner, repo;

  if (!issueNumber) {
    if ("issue" in payload) {
      issueNumber = payload.issue.number;
    }

    if (!issueNumber && "pull_request" in payload) {
      issueNumber = payload.pull_request.number;
    }
  }

  // takes precedence and overrides the payload
  if (fetchParams) {
    owner = fetchParams.owner;
    repo = fetchParams.repo;
    issueNumber = fetchParams.issueNum;
  }

  if (!issueNumber) {
    throw logger.error(`Error fetching issue`, {
      owner: owner || payload.repository.owner.login,
      repo: repo || payload.repository.name,
      issue_number: issueNumber,
    });
  }

  return issueNumber;
}
