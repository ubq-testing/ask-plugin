import { createKey, getAllStreamlinedComments } from "../handlers/comments";
import { Context } from "../types";
import { FetchParams, Issue, LinkedIssues } from "../types/github";
import { StreamlinedComment } from "../types/gpt";

export async function recursivelyFetchLinkedIssues(params: FetchParams) {
  const {
    context: { logger },
  } = params;

  const { linkedIssues, seen, specOrBodies, streamlinedComments } = await fetchLinkedIssues(params);

  logger.info(`Fetching linked issues`, { specOrBodies, streamlinedComments, seen: Array.from(seen) });

  for (const linkedIssue of linkedIssues) {
    const comments = linkedIssue.comments;
    if (!comments) {
      continue;
    }
    const streamed = await getAllStreamlinedComments([linkedIssue]);

    for (const [key, value] of Object.entries(streamed)) {
      if (!streamlinedComments[key]) {
        streamlinedComments[key] = value;
        continue;
      }

      const previous = streamlinedComments[key] || [];
      streamlinedComments[key] = [...previous, ...value];
    }

    if (!linkedIssue.body) {
      continue;
    }

    await handleSpec(params, linkedIssue.body, specOrBodies, createKey(linkedIssue.url, linkedIssue.issueNumber), seen);
  }

  const linkedIssuesKeys = linkedIssues.map((issue) => createKey(issue.url, issue.issueNumber));
  const specAndBodyKeys = Array.from(new Set(Object.keys(specOrBodies).concat(Object.keys(streamlinedComments)).concat(linkedIssuesKeys)));

  for (const key of specAndBodyKeys) {
    let comments = streamlinedComments[key];
    if (!comments) {
      const [owner, repo, issueNumber] = key.split("/");
      await handleIssue({
        ...params,
        owner,
        repo,
        issueNum: parseInt(issueNumber),
      }, streamlinedComments)

      comments = streamlinedComments[key];
    }

    for (const comment of comments) {
      await handleComment(params, comment, streamlinedComments);
    }
  }

  return {
    linkedIssues,
    specAndBodies: specOrBodies,
    streamlinedComments,
  };
}

async function handleIssue(params: FetchParams, streamlinedComments: Record<string, StreamlinedComment[]>) {
  const { comments: fetchedComments, issue } = await fetchIssueComments(params);
  const streamlined = await getAllStreamlinedComments([
    {
      body: issue.body || "",
      comments: fetchedComments,
      issueNumber: issue.number,
      owner: issue.repository?.owner?.login || "",
      repo: issue.repository?.name || "",
      url: issue.url,
    },
  ]);

  for (const [key, value] of Object.entries(streamlined)) {
    const previous = streamlinedComments[key] || [];
    streamlinedComments[key] = [...previous, ...value];
  }
}

async function handleSpec(params: FetchParams, specOrBody: string, specAndBodies: Record<string, string>, key: string, seen: Set<string>) {
  specAndBodies[key] = specOrBody;
  const [owner, repo, issueNumber] = key.split("/");
  const anotherReferencedIssue = idIssueFromComment(owner, specOrBody, { ...params, owner, repo, issueNum: parseInt(issueNumber) });

  if (anotherReferencedIssue) {
    const key = createKey(anotherReferencedIssue.url, anotherReferencedIssue.issueNumber);
    if (!seen.has(key)) {
      seen.add(key);
      const issue = await fetchIssue({
        ...params,
        owner: anotherReferencedIssue.owner,
        repo: anotherReferencedIssue.repo,
        issueNum: anotherReferencedIssue.issueNumber,
      });
      const body = issue.body;
      if (body) {
        specAndBodies[key] = body;
      }
    }
  }
}

async function handleComment(params: FetchParams, comment: StreamlinedComment, streamlinedComments: Record<string, StreamlinedComment[]>) {
  const [, , , , owner, repo, , issueNumber] = comment.issueUrl.split("/");
  const anotherReferencedIssue = idIssueFromComment(owner, comment.body, { ...params, owner, repo, issueNum: parseInt(issueNumber) });

  if (anotherReferencedIssue) {
    const key = createKey(anotherReferencedIssue.url);
    const [owner, repo, issueNumber] = key.split("/");

    if (!streamlinedComments[key]) {
      await handleIssue({
        ...params,
        owner,
        repo,
        issueNum: parseInt(issueNumber),
      }, streamlinedComments)
    }
  }
}

export async function fetchLinkedIssues(params: FetchParams) {
  const { comments, issue } = await fetchIssueComments(params);
  const issueKey = createKey(issue.url);
  const [owner, repo, issueNumber] = issueKey.split("/");
  const linkedIssues: LinkedIssues[] = [
    {
      body: issue.body || "",
      comments,
      issueNumber: parseInt(issueNumber),
      owner,
      repo,
      url: issue.url,
    },
  ];

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
    const linkedIssue = idIssueFromComment(url.split("/")[4], comment.body, {
      repo: url.split("/")[5],
      issueNum: parseInt(url.split("/")[7]),
      context: params.context,
    });
    if (linkedIssue) {
      const key = createKey(linkedIssue.url, linkedIssue.issueNumber);
      seen.add(key);

      const { comments: fetchedComments, issue: fetchedIssue } = await fetchIssueComments({
        context: params.context,
        issueNum: linkedIssue.issueNumber,
        owner: linkedIssue.owner,
        repo: linkedIssue.repo,
      });

      specOrBodies[key] = fetchedIssue.body || "";
      linkedIssue.body = fetchedIssue.body || "";
      linkedIssue.comments = fetchedComments;
      linkedIssues.push(linkedIssue);
    }
  }

  return {
    streamlinedComments: await getAllStreamlinedComments(linkedIssues),
    linkedIssues,
    specOrBodies,
    seen,
  };
}

export function idIssueFromComment(owner?: string, comment?: string | null, params?: FetchParams): LinkedIssues | null {
  if (!comment) {
    return null;
  }

  // the assumption here is that any special GitHub markdown formatting is converted to an anchor tag
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
  const { logger, octokit } = context;

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
    logger.error(`Error fetching pull request diff: `, { e });
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
