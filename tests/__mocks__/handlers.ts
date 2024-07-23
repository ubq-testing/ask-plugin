/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable sonarjs/no-duplicate-string */
import { http, HttpResponse } from "msw";
import { db } from "./db";
import issueTemplate from "./issue-template";

/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  http.post("https://api.openai.com/v1/chat/completions", () => {
    const answer = `This is a mock answer for the chat`;

    return HttpResponse.json({
      usage: {
        completion_tokens: 150,
        prompt_tokens: 1000,
        total_tokens: 1150,
      },
      choices: [
        {
          message: {
            content: answer,
          },
        },
      ],
    });
  }),
  //  GET https://api.github.com/repos/ubiquity/test-repo/issues/1
  http.get("https://api.github.com/repos/:owner/:repo/issues/:issue_number", ({ params: { owner, repo, issue_number } }) => {
    return HttpResponse.json(
      db.issue.findFirst({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, number: { equals: Number(issue_number) } } })
    );
  }),

  // get repo
  http.get("https://api.github.com/repos/:owner/:repo", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    const item = db.repo.findFirst({ where: { name: { equals: repo }, owner: { login: { equals: owner } } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),
  // get issue
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    return HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner }, repo: { equals: repo } } }));
  }),
  // create issue
  http.post("https://api.github.com/repos/:owner/:repo/issues", () => {
    const id = db.issue.count() + 1;
    const newItem = { ...issueTemplate, id };
    db.issue.create(newItem);
    return HttpResponse.json(newItem);
  }),
  // get repo issues
  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org } }: { params: { org: string } }) => {
    return HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org } } } }));
  }),
  // add comment to issue
  http.post("https://api.github.com/repos/:owner/:repo/issues/:issue_number/comments", ({ params: { owner, repo, issue_number } }) => {
    return HttpResponse.json({ owner, repo, issue_number });
  }),
  // list pull requests
  http.get("https://api.github.com/repos/:owner/:repo/pulls", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    return HttpResponse.json(db.pull.findMany({ where: { owner: { equals: owner }, repo: { equals: repo } } }));
  }),
  // update a pull request
  http.patch("https://api.github.com/repos/:owner/:repo/pulls/:pull_number", ({ params: { owner, repo, pull_number } }) => {
    return HttpResponse.json({ owner, repo, pull_number });
  }),
  // issues list for repo
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }) => {
    return HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }));
  }),
  // list issue comments
  http.get("https://api.github.com/repos/:owner/:repo/issues/:issue_number/comments", ({ params: { owner, repo, issue_number } }) => {
    return HttpResponse.json(
      db.comments.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, issue_number: { equals: Number(issue_number) } } })
    );
  }),
  //list review comments
  http.get("https://api.github.com/repos/:owner/:repo/pulls/:pull_number/comments", ({ params: { owner, repo, pull_number } }) => {
    return HttpResponse.json(
      db.comments.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, issue_number: { equals: Number(pull_number) } } })
    );
  }),
  //  octokit.pulls.get
  http.get("https://api.github.com/repos/:owner/:repo/pulls/:pull_number", ({ params: { owner, repo, pull_number } }) => {
    return HttpResponse.json(
      db.pull.findFirst({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, number: { equals: Number(pull_number) } } })
    );
  }),
];
