import { createKey, getAllStreamlinedComments } from "../handlers/comments";
import { Context } from "../types";
import { FetchParams, Issue, LinkedIssues } from "../types/github";
import { StreamlinedComment } from "../types/gpt";

export async function recursivelyFetchLinkedIssues(params: FetchParams) {
  const { linkedIssues, seen, specOrBodies, streamlinedComments } = await fetchLinkedIssues(params);

  const fetchPromises = linkedIssues.map((linkedIssue) => fetchCommentsAndHandleSpec(params, linkedIssue, streamlinedComments, specOrBodies, seen));
  await Promise.allSettled(fetchPromises);

  const linkedIssuesKeys = linkedIssues.map((issue) => createKey(issue.url, issue.issueNumber));
  const specAndBodyKeys = Array.from(new Set([...Object.keys(specOrBodies), ...Object.keys(streamlinedComments), ...linkedIssuesKeys]));
  await processSpecAndBodyKeys(specAndBodyKeys, params, dedupeStreamlinedComments(streamlinedComments), seen);

  return { linkedIssues, specAndBodies: specOrBodies, streamlinedComments };
}

function dedupeStreamlinedComments(streamlinedComments: Record<string, StreamlinedComment[]>) {
  for (const key of Object.keys(streamlinedComments)) {
    streamlinedComments[key] = streamlinedComments[key].filter(
      (comment: StreamlinedComment, index: number, self: StreamlinedComment[]) => index === self.findIndex((t: StreamlinedComment) => t.body === comment.body)
    );
  }

  return streamlinedComments;
}

async function fetchCommentsAndHandleSpec(
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

async function processSpecAndBodyKeys(keys: string[], params: FetchParams, streamlinedComments: Record<string, StreamlinedComment[]>, seen: Set<string>) {
  const commentProcessingPromises = keys.map(async (key) => {
    let comments = streamlinedComments[key];
    if (!comments || comments.length === 0) {
      comments = await fetchAndHandleIssue(key, params, streamlinedComments, seen);
    }
    return Promise.all(comments.map((comment: StreamlinedComment) => handleComment(params, comment, streamlinedComments, seen)));
  });

  await Promise.all(commentProcessingPromises);
}

function mergeStreamlinedComments(existingComments: Record<string, StreamlinedComment[]>, newComments: Record<string, StreamlinedComment[]>) {
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

async function fetchAndHandleIssue(
  key: string,
  params: FetchParams,
  streamlinedComments: Record<string, StreamlinedComment[]>,
  seen: Set<string>
): Promise<StreamlinedComment[]> {
  const [owner, repo, issueNumber] = splitKey(key);
  await handleIssue({ ...params, owner, repo, issueNum: parseInt(issueNumber) }, streamlinedComments, seen);
  return streamlinedComments[key] || [];
}

async function handleIssue(params: FetchParams, streamlinedComments: Record<string, StreamlinedComment[]>, alreadySeen?: Set<string>) {
  if (alreadySeen && alreadySeen.has(createKey(`${params.owner}/${params.repo}/${params.issueNum}`))) {
    return;
  }
  const { linkedIssues, seen, specOrBodies, streamlinedComments: streamlined } = await fetchLinkedIssues(params);
  const fetchPromises = linkedIssues.map((linkedIssue) => fetchCommentsAndHandleSpec(params, linkedIssue, streamlinedComments, specOrBodies, seen));
  await Promise.allSettled(fetchPromises);
  return mergeStreamlinedComments(streamlinedComments, streamlined);
}

async function handleSpec(
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

async function handleComment(params: FetchParams, comment: StreamlinedComment, streamlinedComments: Record<string, StreamlinedComment[]>, seen: Set<string>) {
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

function splitKey(key: string): [string, string, string] {
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
    comments,
  };
}
