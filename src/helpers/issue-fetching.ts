import { createKey, getAllStreamlinedComments } from "../handlers/comments";
import { Context } from "../types";
import { FetchParams, Issue, IssueComments, LinkedIssues, ReviewComments } from "../types/github";
import { StreamlinedComment } from "../types/gpt";
import { dedupeStreamlinedComments, idIssueFromComment, mergeStreamlinedComments, splitKey } from "./issue";
import { handleIssue, handleSpec, handleSpecAndBodyKeys } from "./issue-handling";

export async function recursivelyFetchLinkedIssues(params: FetchParams) {
  const { linkedIssues, seen, specOrBodies, streamlinedComments } = await fetchLinkedIssues(params);

  const fetchPromises = linkedIssues.map((linkedIssue) => fetchCommentsAndHandleSpec(params, linkedIssue, streamlinedComments, specOrBodies, seen));
  await Promise.allSettled(fetchPromises);

  const linkedIssuesKeys = linkedIssues.map((issue) => createKey(issue.url, issue.issueNumber));
  const specAndBodyKeys = Array.from(new Set([...Object.keys(specOrBodies), ...Object.keys(streamlinedComments), ...linkedIssuesKeys]));
  await handleSpecAndBodyKeys(specAndBodyKeys, params, dedupeStreamlinedComments(streamlinedComments), seen);

  return { linkedIssues, specAndBodies: specOrBodies, streamlinedComments };
}

export async function fetchPullRequestDiff(context: Context, org: string, repo: string, issue: number) {
  const { octokit } = context;

  try {
    const diff = await octokit.pulls.get({
      owner: org,
      repo,
      pull_number: issue,
      mediaType: {
        format: "diff",
      },
    });
    return diff.data as unknown as string;
  } catch (e) {
    return null;
  }
}

export async function fetchIssue(params: FetchParams) {
  const { octokit, payload } = params.context;
  const { issueNum, owner, repo } = params;

  return await octokit.issues
    .get({
      owner: owner || payload.repository.owner.login,
      repo: repo || payload.repository.name,
      issue_number: issueNum || payload.issue.number,
    })
    .then(({ data }) => data as Issue);
}

export async function fetchIssueComments(params: FetchParams) {
  const { octokit, payload } = params.context;
  const { issueNum, owner, repo } = params;

  const issue = await fetchIssue(params);

  let comments;
  if (issue.pull_request) {
    /**
     * With every review comment with a tagged code line we have `diff_hunk` which is great context
     * but could easily max our tokens.
     */
    comments = await octokit.paginate(octokit.pulls.listReviewComments, {
      owner: owner || payload.repository.owner.login,
      repo: repo || payload.repository.name,
      pull_number: issueNum || payload.issue.number,
    });
  } else {
    comments = await octokit.paginate(octokit.issues.listComments, {
      owner: owner || payload.repository.owner.login,
      repo: repo || payload.repository.name,
      issue_number: issueNum || payload.issue.number,
    });
  }

  return {
    issue,
    comments: comments.filter((comment) => comment.user?.type !== "Bot") as IssueComments | ReviewComments,
  };
}

export async function fetchLinkedIssues(params: FetchParams) {
  const { comments, issue } = await fetchIssueComments(params);
  const issueKey = createKey(issue.url);
  const [owner, repo, issueNumber] = splitKey(issueKey);
  const linkedIssues: LinkedIssues[] = [{ body: issue.body || "", comments, issueNumber: parseInt(issueNumber), owner, repo, url: issue.url }];

  const specOrBodies: Record<string, string> = {};
  specOrBodies[issueKey] = issue.body || "";

  const seen = new Set<string>();
  seen.add(issueKey);

  for (const comment of comments) {
    let url = "";
    if ("issue_url" in comment) {
      url = comment.issue_url;
    } else if ("pull_request_url" in comment) {
      url = comment.pull_request_url;
    }

    const key = createKey(url);
    const linkedIssue = idIssueFromComment(key.split("/")[0], comment.body, {
      repo: key.split("/")[1],
      issueNum: parseInt(key.split("/")[2]),
      context: params.context,
    });

    if (linkedIssue) {
      const linkedKey = createKey(linkedIssue.url, linkedIssue.issueNumber);
      seen.add(linkedKey);
      const [owner, repo, issueNumber] = splitKey(linkedKey);

      const { comments: fetchedComments, issue: fetchedIssue } = await fetchIssueComments({
        context: params.context,
        issueNum: parseInt(issueNumber),
        owner,
        repo,
      });

      specOrBodies[linkedKey] = fetchedIssue.body || "";
      linkedIssue.body = fetchedIssue.body || "";
      linkedIssue.comments = fetchedComments;
      linkedIssues.push(linkedIssue);
    }
  }

  return { streamlinedComments: await getAllStreamlinedComments(linkedIssues), linkedIssues, specOrBodies, seen };
}

export async function fetchAndHandleIssue(
  key: string,
  params: FetchParams,
  streamlinedComments: Record<string, StreamlinedComment[]>,
  seen: Set<string>
): Promise<StreamlinedComment[]> {
  const [owner, repo, issueNumber] = splitKey(key);
  await handleIssue({ ...params, owner, repo, issueNum: parseInt(issueNumber) }, streamlinedComments, seen);
  return streamlinedComments[key] || [];
}

export async function fetchCommentsAndHandleSpec(
  params: FetchParams,
  linkedIssue: LinkedIssues,
  streamlinedComments: Record<string, StreamlinedComment[]>,
  specOrBodies: Record<string, string>,
  seen: Set<string>
) {
  if (linkedIssue.comments) {
    const streamed = await getAllStreamlinedComments([linkedIssue]);
    const merged = mergeStreamlinedComments(streamlinedComments, streamed);
    streamlinedComments = { ...streamlinedComments, ...merged };
  }

  if (linkedIssue.body) {
    await handleSpec(params, linkedIssue.body, specOrBodies, createKey(linkedIssue.url, linkedIssue.issueNumber), seen, streamlinedComments);
  }
}
