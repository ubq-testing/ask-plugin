import { Context } from "../types";
import { Issue, IssueComments } from "../types/github";

type FetchParams = {
  context: Context;
  issueNum?: number;
  owner?: string;
  repo?: string;
};

/**
 * Because in the eyes of the GitHub api Pull Requests are also
 * issues, we can use the same functions for both.
 */

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

  return await octokit
    .paginate(octokit.issues.listComments, {
      owner: owner || payload.repository.owner.login,
      repo: repo || payload.repository.name,
      issue_number: issueNum || payload.issue.number,
    })
    .then((comments) => comments as IssueComments);
}

export async function fetchLinkedIssues(params: FetchParams, comments?: IssueComments) {
  let issueComments: IssueComments | undefined = comments;
  const linkedIssues: {
    issueNumber: number;
    repo: string;
  }[] = [];

  if (!issueComments && !params) {
    throw new Error("Either issueComments or params must be provided");
  }

  if (!issueComments) {
    issueComments = await fetchIssueComments(params);
  }

  const {
    context: {
      logger,
      payload: {
        repository: {
          owner: { login },
        },
      },
    },
  } = params;

  if (!issueComments) {
    logger.info("No comments found on issue");
    return linkedIssues;
  }

  for (const comment of issueComments) {
    const linkedIssue = idIssueFromComment(login, comment.body);
    if (linkedIssue) {
      linkedIssues.push(linkedIssue);
    }
  }

  return await filterLinkedIssues(params, linkedIssues);
}

async function filterLinkedIssues(params: FetchParams, linkedIssues: { issueNumber: number; repo: string }[]) {
  const {
    context: {
      logger,
      payload: {
        repository: {
          owner: { login },
        },
      },
    },
  } = params;

  const contextIssues: {
    issueNumber: number;
    repo: string;
  }[] = [];

  for (const issue of linkedIssues) {
    if (issue && issue.issueNumber && issue.repo) {
      if (await isRepoFromSameOrg(params.context, issue.repo, login)) {
        contextIssues.push({
          issueNumber: issue.issueNumber,
          repo: issue.repo,
        });
      } else {
        logger.info(`Ignoring linked issue ${issue.issueNumber} from ${issue.repo} as it is not from the same org`);
      }
    }
  }

  return contextIssues;
}

export async function getLinkedIssueContextFromComments(context: Context, issueComments: IssueComments) {
  // find any linked issues in comments by parsing the comments and enforcing that the
  // linked issue is from the same org that the current issue is from
  const linkedIssues = await fetchLinkedIssues({ context }, issueComments);

  // the conversational history of the linked issues
  const linkedIssueComments: IssueComments = [];

  // we are only going one level deep with the linked issue context fetching
  for (const issue of linkedIssues) {
    const fetched = await fetchIssueComments({ context, issueNum: issue.issueNumber, repo: issue.repo });
    linkedIssueComments.push(...fetched);
  }

  return { linkedIssues, linkedIssueComments };
}

export function idIssueFromComment(owner?: string, comment?: string | null) {
  if (!comment) {
    return null;
  }
  if (!owner) {
    throw new Error("Owner must be provided when parsing linked issues");
  }
  // the assumption here is that any special GitHub markdown formatting is converted to an anchor tag
  const urlMatch = comment.match(/https:\/\/github.com\/([^/]+)\/([^/]+)\/(pull|issue|issues)\/(\d+)/);

  /**
   * I think we should restrict including any linked context which is not of the same org.
   *
   * In most cases this will be the expected behaviour, I remember a scenario where
   * I linked to an issue in a 3rd party org, for extra reviewer context but I also include the
   * TL;DR which is always the case. We wouldn't want that full 3rd party PR review or issue to be
   * included in the context.
   */

  const linkedIssue: {
    issueNumber: number;
    repo: string;
  } = {
    issueNumber: 0,
    repo: "",
  };

  /**
   * If following the rule that only issues from the same org should be included
   * then we need to be sure that this format of linked issue is from the same org.
   */

  if (urlMatch && urlMatch[1] === owner) {
    linkedIssue.issueNumber = parseInt(urlMatch[4]);
    linkedIssue.repo = urlMatch[2];
  }

  return linkedIssue;
}

async function isRepoFromSameOrg(context: Context, repo: string, owner: string) {
  const { octokit } = context;
  const { data } = await octokit.repos.get({
    owner,
    repo,
  });

  return data.owner.login === owner;
}

export async function fetchPullRequestDiff(context: Context, org: string, repo: string, issue: string) {
  const { logger, octokit } = context;

  try {
    const diff = await octokit.pulls.get({
      owner: org,
      repo,
      pull_number: parseInt(issue),
      mediaType: {
        format: "diff",
      },
    });
    return diff.data as unknown as string;
  } catch (error) {
    logger.error(`Error fetching pull request diff: ${error}`);
    return null;
  }
}
