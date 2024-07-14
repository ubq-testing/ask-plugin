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
  if (!issueUrl) throw new Error("issueUrl is required");
  if (issueUrl.includes("undefined")) {
    throw new Error("issueUrl is not valid");
  }
  const [, , , , issueOrg, issueRepo, , issueNumber] = issueUrl.split("/");

  return `${issueOrg}/${issueRepo}/${issueNumber || issue}`;
}

export function streamlineComments(comments: IssueComments | ReviewComments) {
  const streamlined: Record<string, StreamlinedComment[]> = {};

  for (const comment of comments) {
    const user = comment.user;
    if (user && user.type === "Bot") {
      continue;
    }

    let url = "";
    if ("issue_url" in comment) {
      url = comment.issue_url;
    } else if ("pull_request_url" in comment) {
      url = comment.pull_request_url;
    }

    const body = comment.body;
    const key = createKey(url);

    if (!streamlined[key]) {
      streamlined[key] = [];
    }

    if (user && body) {
      streamlined[key].push({
        user: user.login,
        body,
        id: comment.id,
        org: url.split("/")[4],
        repo: url.split("/")[5],
        issueUrl: url,
      });
    }
  }
  return streamlined;
}
