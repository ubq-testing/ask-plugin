import { createKey } from "../handlers/comments";
import { LinkedIssues } from "../types/github";
import { StreamlinedComment } from "../types/gpt";

export function dedupeStreamlinedComments(streamlinedComments: Record<string, StreamlinedComment[]>) {
  for (const key of Object.keys(streamlinedComments)) {
    streamlinedComments[key] = streamlinedComments[key].filter(
      (comment: StreamlinedComment, index: number, self: StreamlinedComment[]) => index === self.findIndex((t: StreamlinedComment) => t.body === comment.body)
    );
  }

  return streamlinedComments;
}

export function mergeStreamlinedComments(existingComments: Record<string, StreamlinedComment[]>, newComments: Record<string, StreamlinedComment[]>) {
  if (!existingComments) {
    existingComments = {};
  }
  for (const [key, value] of Object.entries(newComments)) {
    if (!existingComments[key]) {
      existingComments[key] = [];
    }

    const previous = existingComments[key] || [];
    existingComments[key] = [...previous, ...value];
  }

  return existingComments;
}

export function splitKey(key: string): [string, string, string] {
  const parts = key.split("/");
  return [parts[0], parts[1], parts[2]];
}

export function idIssueFromComment(comment?: string | null): LinkedIssues[] | null {
  const urlMatch = comment?.match(/https:\/\/(?:www\.)?github.com\/([^/]+)\/([^/]+)\/(pull|issue|issues)\/(\d+)/g);
  const response: LinkedIssues[] = [];

  if (urlMatch && urlMatch.length > 0) {
    urlMatch.forEach((url) => {
      response.push(createLinkedIssueOrPr(url));
    });
  }

  return response;
}

function createLinkedIssueOrPr(
  url: string
): LinkedIssues {
  const key = createKey(url);
  const [owner, repo, issueNumber] = splitKey(key);

  return {
    owner,
    repo,
    issueNumber: parseInt(issueNumber),
    url,
  };
}