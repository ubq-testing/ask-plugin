import { createKey } from "../handlers/comments";
import { FetchParams } from "../types/github";
import { StreamlinedComment } from "../types/gpt";
import { idIssueFromComment, mergeStreamlinedComments, splitKey } from "./issue";
import { fetchLinkedIssues, fetchIssue, fetchAndHandleIssue, fetchCommentsAndHandleSpec } from "./issue-fetching";

export async function handleIssue(params: FetchParams, streamlinedComments: Record<string, StreamlinedComment[]>, alreadySeen?: Set<string>) {
  if (alreadySeen && alreadySeen.has(createKey(`////${params.owner}/${params.repo}/${params.issueNum}`))) {
    return;
  }
  const { linkedIssues, seen, specOrBodies, streamlinedComments: streamlined } = await fetchLinkedIssues(params);
  const fetchPromises = linkedIssues.map((linkedIssue) => fetchCommentsAndHandleSpec(params, linkedIssue, streamlinedComments, specOrBodies, seen));
  await Promise.allSettled(fetchPromises);
  return mergeStreamlinedComments(streamlinedComments, streamlined);
}

export async function handleSpec(
  params: FetchParams,
  specOrBody: string,
  specAndBodies: Record<string, string>,
  key: string,
  seen: Set<string>,
  streamlinedComments: Record<string, StreamlinedComment[]>
) {
  specAndBodies[key] = specOrBody;
  const [owner, repo, issueNumber] = splitKey(key);
  const anotherReferencedIssue = idIssueFromComment(owner, specOrBody, { ...params, owner, repo, issueNum: parseInt(issueNumber) });

  if (anotherReferencedIssue) {
    const anotherKey = createKey(anotherReferencedIssue.url, anotherReferencedIssue.issueNumber);
    if (seen.has(anotherKey)) {
      return;
    }
    seen.add(anotherKey);
    const issue = await fetchIssue({
      ...params,
      owner: anotherReferencedIssue.owner,
      repo: anotherReferencedIssue.repo,
      issueNum: anotherReferencedIssue.issueNumber,
    });
    if (issue.body) {
      specAndBodies[anotherKey] = issue.body;
    }
    const [owner, repo, issueNum] = splitKey(anotherKey);
    if (!streamlinedComments[anotherKey]) {
      await handleIssue({ ...params, owner, repo, issueNum: parseInt(issueNum) }, streamlinedComments, seen);
      await handleSpec({ ...params, owner, repo, issueNum: parseInt(issueNum) }, issue.body || "", specAndBodies, anotherKey, seen, streamlinedComments);
    }
  }

  return specAndBodies;
}

export async function handleComment(
  params: FetchParams,
  comment: StreamlinedComment,
  streamlinedComments: Record<string, StreamlinedComment[]>,
  seen: Set<string>
) {
  const [, , , , owner, repo, , issueNumber] = comment.issueUrl.split("/");
  const anotherReferencedIssue = idIssueFromComment(owner, comment.body, { ...params, owner, repo, issueNum: parseInt(issueNumber) });

  if (anotherReferencedIssue) {
    const key = createKey(anotherReferencedIssue.url);
    const [refOwner, refRepo, refIssueNumber] = splitKey(key);

    if (!streamlinedComments[key]) {
      await handleIssue({ ...params, owner: refOwner, repo: refRepo, issueNum: parseInt(refIssueNumber) }, streamlinedComments, seen);
    }
  }
}

export async function handleSpecAndBodyKeys(keys: string[], params: FetchParams, streamlinedComments: Record<string, StreamlinedComment[]>, seen: Set<string>) {
  const commentProcessingPromises = keys.map(async (key) => {
    let comments = streamlinedComments[key];
    if (!comments || comments.length === 0) {
      comments = await fetchAndHandleIssue(key, params, streamlinedComments, seen);
    }
    return Promise.all(comments.map((comment: StreamlinedComment) => handleComment(params, comment, streamlinedComments, seen)));
  });

  await Promise.all(commentProcessingPromises);
}
