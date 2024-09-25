import { createKey, getAllStreamlinedComments } from "../handlers/comments";
import { Context } from "../types";
import { FetchParams, Issue, IssueComments, LinkedIssues, ReviewComments } from "../types/github";
import { StreamlinedComment } from "../types/gpt";
import { dedupeStreamlinedComments, idIssueFromComment, mergeStreamlinedComments, splitKey } from "./issue";
import { handleIssue, handleSpec, handleSpecAndBodyKeys, throttlePromises } from "./issue-handling";

export async function recursivelyFetchLinkedIssues(params: FetchParams) {
  const { linkedIssues, seen, specAndBodies, streamlinedComments } = await fetchLinkedIssues(params);

  const fetchPromises = linkedIssues.map(async (linkedIssue) => await mergeCommentsAndFetchSpec(params, linkedIssue, streamlinedComments, specAndBodies, seen));
  await throttlePromises(fetchPromises, 10);

  const linkedIssuesKeys = linkedIssues.map((issue) => createKey(`${issue.owner}/${issue.repo}/${issue.issueNumber}`));
  const specAndBodyKeys = Array.from(new Set([...Object.keys(specAndBodies), ...Object.keys(streamlinedComments), ...linkedIssuesKeys]));

  await handleSpecAndBodyKeys(specAndBodyKeys, params, dedupeStreamlinedComments(streamlinedComments), seen);
  return { linkedIssues, specAndBodies, streamlinedComments };
}

export async function fetchLinkedIssues(params: FetchParams) {
  const { comments, issue } = await fetchIssueComments(params);
  const issueKey = createKey(issue.html_url);
  const [owner, repo, issueNumber] = splitKey(issueKey);
  const linkedIssues: LinkedIssues[] = [{ body: issue.body || "", comments, issueNumber: parseInt(issueNumber), owner, repo, url: issue.html_url }];
  const specAndBodies: Record<string, string> = {};
  const seen = new Set<string>();

  // add the spec body as a comment
  comments.push({
    body: issue.body || "",
    // @ts-expect-error - github types undefined
    user: issue.user,
    id: issue.id,
    html_url: issue.html_url,
  });

  for (const comment of comments) {
    const foundIssues = idIssueFromComment(comment.body, params);
    if (foundIssues) {
      for (const linkedIssue of foundIssues) {
        const linkedKey = createKey(linkedIssue.url, linkedIssue.issueNumber);
        if (seen.has(linkedKey)) {
          continue;
        }
        seen.add(linkedKey);
        const { issueNumber, owner, repo } = linkedIssue;

        const { comments: fetchedComments, issue: fetchedIssue } = await fetchIssueComments({
          context: params.context,
          issueNum: issueNumber,
          owner,
          repo,
        });

        specAndBodies[linkedKey] = fetchedIssue.body || "";
        linkedIssue.body = fetchedIssue.body || "";
        linkedIssue.comments = fetchedComments;
        linkedIssues.push(linkedIssue);
      }
    }
  }

  return { streamlinedComments: await getAllStreamlinedComments(linkedIssues), linkedIssues, specAndBodies, seen };
}

export async function mergeCommentsAndFetchSpec(
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

  return await octokit.rest.issues
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
