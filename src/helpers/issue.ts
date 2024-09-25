import { FetchParams, LinkedIssues } from "../types/github";
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

export function idIssueFromComment(owner?: string, comment?: string | null, params?: FetchParams): LinkedIssues | null {
  if (!comment) {
    return null;
  }

  const urlMatch = comment.match(/https:\/\/(?:www\.)?github.com\/([^/]+)\/([^/]+)\/(pull|issue|issues)\/(\d+)/);
  const hashMatch = comment.match(/#(\d+)/);

  if (hashMatch) {
    return {
      owner: owner || params?.owner || "",
      repo: params?.repo || "",
      issueNumber: parseInt(hashMatch[1]),
      url: `https://api.github.com/repos/${params?.owner || owner}/${params?.repo}/issues/${hashMatch[1]}`,
    } as LinkedIssues;
  }

  if (urlMatch) {
    return {
      url: `https://api.github.com/repos/${urlMatch[1]}/${urlMatch[2]}/issues/${urlMatch[4]}`,
      owner: owner ?? urlMatch[1],
      repo: urlMatch[2],
      issueNumber: parseInt(urlMatch[4]),
    } as LinkedIssues;
  }

  return null;
}
