import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import usersGet from "./__mocks__/users-get.json";
import { expect, describe, beforeAll, beforeEach, afterAll, afterEach, it, jest } from "@jest/globals";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Context, SupportedEventsU } from "../src/types";
import { drop } from "@mswjs/data";
import issueTemplate from "./__mocks__/issue-template";
import repoTemplate from "./__mocks__/repo-template";
import { askQuestion } from "../src/handlers/ask-gpt";
import { plugin } from "../src/plugin";

const TEST_QUESTION = "What is pi?";
const TEST_SLASH_COMMAND = "/gpt what is pi?";

type Comment = {
  id: number;
  user: {
    login: string;
    type: string;
  };
  body: string;
  url: string;
  html_url: string;
  owner: string;
  repo: string;
  issue_number: number;
  issue_url?: string;
  pull_request_url?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const octokit = jest.requireActual("@octokit/rest") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.requireActual("openai") as any;

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  drop(db);
  server.resetHandlers();
});
afterAll(() => server.close());

// TESTS

describe("Ask plugin tests", () => {
  beforeEach(async () => {
    await setupTests();
  });

  it("should ask GPT a question", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    const res = await askQuestion(ctx, TEST_QUESTION);

    expect(res).toBeDefined();

    expect(res?.answer).toBe("This is a mock answer for the chat");
  });

  it("should not ask GPT a question if plugin is disabled", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND, false);
    const infoSpy = jest.spyOn(ctx.logger, "info");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    const res = await plugin(ctx);

    expect(res).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith("Plugin is disabled. Skipping.");
  });

  it("should not ask GPT a question if comment is from a bot", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    const infoSpy = jest.spyOn(ctx.logger, "info");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    if (!ctx.payload.comment.user) return;
    ctx.payload.comment.user.type = "Bot";
    const res = await plugin(ctx);

    expect(res).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith("Comment is from a bot. Skipping.");
  });

  it("should not ask GPT a question if comment does not start with /gpt", async () => {
    const ctx = createContext(TEST_QUESTION);
    const infoSpy = jest.spyOn(ctx.logger, "info");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    const res = await plugin(ctx);

    expect(res).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith("Comment does not start with /gpt. Skipping.");
  });

  it("should not ask GPT a question if no question is provided", async () => {
    const ctx = createContext("/gpt");
    const errorSpy = jest.spyOn(ctx.logger, "error");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    const res = await plugin(ctx);

    expect(res).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("No question provided");
  });

  it("should not ask GPT a question if no OpenAI API key is provided", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    const errorSpy = jest.spyOn(ctx.logger, "error");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    ctx.config.openAi_apiKey = "";
    const res = await plugin(ctx);

    expect(res).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("No OpenAI API Key provided");
  });
});

// HELPERS

function transformCommentTemplate(commentId: number, issueNumber: number, body: string, owner: string, repo: string, isIssue = true) {
  const COMMENT_TEMPLATE = {
    id: 1,
    user: {
      login: "ubiquity",
      type: "User",
    },
    body: TEST_QUESTION,
    url: "https://api.github.com/repos/ubiquity/test-repo/issues/comments/1",
    html_url: "https://api.github.com/repos/ubiquity/test-repo/issues/1",
    owner: "ubiquity",
    repo: "test-repo",
    issue_number: 1,
  };

  const comment: Comment = {
    id: commentId,
    user: {
      login: COMMENT_TEMPLATE.user.login,
      type: "User",
    },
    body: body,
    url: COMMENT_TEMPLATE.url.replace("1", issueNumber.toString()),
    html_url: COMMENT_TEMPLATE.html_url.replace("1", issueNumber.toString()),
    owner: owner,
    repo: repo,
    issue_number: issueNumber,
  };

  if (isIssue) {
    comment.issue_url = COMMENT_TEMPLATE.html_url.replace("1", issueNumber.toString());
  } else {
    comment.pull_request_url = COMMENT_TEMPLATE.html_url.replace("1", issueNumber.toString());
  }

  return comment;
}

async function setupTests() {
  for (const item of usersGet) {
    db.users.create(item);
  }

  db.repo.create({
    ...repoTemplate,
  });

  db.issue.create({
    ...issueTemplate,
  });
}

function createComments(comments: Comment[]) {
  for (const comment of comments) {
    db.comments.create({
      ...comment,
    });
  }
}

function createContext(body = TEST_SLASH_COMMAND, isEnabled = true, depth = 5) {
  const user = db.users.findFirst({ where: { id: { equals: 1 } } });
  return {
    payload: {
      issue: db.issue.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["issue"],
      sender: user,
      repository: db.repo.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["repository"],
      comment: { body, user: user } as unknown as Context["payload"]["comment"],
      action: "created" as string,
      installation: { id: 1 } as unknown as Context["payload"]["installation"],
      organization: { login: "ubiquity" } as unknown as Context["payload"]["organization"],
    },
    logger: new Logs("debug"),
    config: {
      isEnabled,
      openAi_apiKey: "test",
      linkedIssueFetchDepth: depth,
    },
    octokit: new octokit.Octokit(),
    eventName: "issue_comment.created" as SupportedEventsU,
  } as unknown as Context;
}
