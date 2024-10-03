import { splitKey } from "../helpers/issue";
import { IssueComments, LinkedIssues, ReviewComments } from "../types/github";
import { StreamlinedComment } from "../types/gpt";

export async function getAllStreamlinedComments(linkedIssues: LinkedIssues[]) {
  const streamlinedComments: Record<string, StreamlinedComment[]> = {};

  for (const issue of linkedIssues) {
    const linkedIssueComments = issue.comments;
    if (!linkedIssueComments) continue;

    if (linkedIssueComments.length > 0) {
      const linkedStreamlinedComments = streamlineComments(linkedIssueComments);

      if (linkedStreamlinedComments) {
        for (const [key, value] of Object.entries(linkedStreamlinedComments)) {
          if (!streamlinedComments[key]) {
            streamlinedComments[key] = value;
            continue;
          }

          const previous = streamlinedComments[key] || [];
          streamlinedComments[key] = [...previous, ...value];
        }
      }
    }
  }

  return streamlinedComments;
}

export function createKey(issueUrl: string, issue?: number) {
  const urlParts = issueUrl.split("/");

  let key = "";

  if (urlParts.length === 7) {
    const [, , , issueOrg, issueRepo, , issueNumber] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issueNumber}`;
  }

  if (urlParts.length === 5) {
    const [, , issueOrg, issueRepo] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issue}`;
  }

  if (urlParts.length === 8) {
    const [, , , issueOrg, issueRepo, , , issueNumber] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issueNumber || issue}`;
  }

  if (urlParts.length === 3) {
    const [issueOrg, issueRepo, issueNumber] = urlParts;
    key = `${issueOrg}/${issueRepo}/${issueNumber || issue}`;
  }

  if (!key) {
    throw new Error("Invalid issue url");
  }

  if (key.includes("#")) {
    key = key.split("#")[0];
  }

  return key;
}

export function streamlineComments(comments: IssueComments | ReviewComments) {
  const streamlined: Record<string, StreamlinedComment[]> = {};

  for (const comment of comments) {
    const user = comment.user;
    if (user && user.type === "Bot") {
      continue;
    }

    const url = comment.html_url;
    const body = comment.body;
    const key = createKey(url);
    const [owner, repo] = splitKey(key);

    if (!streamlined[key]) {
      streamlined[key] = [];
    }

    if (user && body) {
      streamlined[key].push({
        user: user.login,
        body,
        id: comment.id,
        org: owner,
        repo,
        issueUrl: url,
      });
    }
  }
  return streamlined;
}
