import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import usersGet from "./__mocks__/users-get.json";
import { expect, describe, beforeAll, beforeEach, afterAll, afterEach, it } from "@jest/globals";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Context, SupportedEventsU } from "../src/types";
import { drop } from "@mswjs/data";
import issueTemplate from "./__mocks__/issue-template";
import repoTemplate from "./__mocks__/repo-template";
import { askQuestion } from "../src/handlers/ask-gpt";
import { runPlugin } from "../src/plugin";

const TEST_QUESTION = "what is pi?";
const TEST_SLASH_COMMAND = "@UbiquityOS what is pi?";
const LOG_CALLER = "_Logs.<anonymous>";

const systemMsg = `You are a GitHub integrated chatbot tasked with assisting in research and discussion on GitHub issues and pull requests.
Using the provided context, address the question being asked providing a clear and concise answer with no follow-up statements.
The LAST comment in 'Issue Conversation' is the most recent one, focus on it as that is the question being asked.
Use GitHub flavoured markdown in your response making effective use of lists, code blocks and other supported GitHub md features.`;

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

const octokit = jest.requireActual("@octokit/rest");
jest.requireActual("openai");

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

  it("should not ask GPT a question if comment is from a bot", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    const infoSpy = jest.spyOn(ctx.logger, "info");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    if (!ctx.payload.comment.user) return;
    ctx.payload.comment.user.type = "Bot";
    await runPlugin(ctx);

    expect(infoSpy).toHaveBeenCalledWith("Comment is from a bot. Skipping.");
  });

  it("should not ask GPT a question if comment does not start with /gpt", async () => {
    const ctx = createContext(TEST_QUESTION);
    const infoSpy = jest.spyOn(ctx.logger, "info");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    await runPlugin(ctx);

    expect(infoSpy).toHaveBeenCalledWith("Comment does not mention the app. Skipping.");
  });

  it("should not ask GPT a question if no question is provided", async () => {
    const ctx = createContext(`@UbiquityOS `);
    const infoSpy = jest.spyOn(ctx.logger, "info");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    await runPlugin(ctx);

    expect(infoSpy).toHaveBeenCalledWith("Comment is empty. Skipping.");
  });

  it("should not ask GPT a question if no OpenAI API key is provided", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    const errorSpy = jest.spyOn(ctx.logger, "error");

    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    ctx.env.OPENAI_API_KEY = "";
    await runPlugin(ctx);

    expect(errorSpy).toHaveBeenNthCalledWith(1, "No OpenAI API Key detected!");
  });

  it("should construct the chat history correctly", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    const infoSpy = jest.spyOn(ctx.logger, "info");
    createComments([transformCommentTemplate(1, 1, TEST_QUESTION, "ubiquity", "test-repo", true)]);
    await runPlugin(ctx);

    expect(infoSpy).toHaveBeenCalledTimes(3);

    const prompt = `=== Current Issue #1 Specification === ubiquity/test-repo/1 ===

This is a demo spec for a demo task just perfect for testing.
=== End Current Issue #1 Specification ===

=== Current Issue #1 Conversation === ubiquity/test-repo #1 ===

1 ubiquity: what is pi?
=== End Current Issue #1 Conversation ===\n
`;

    expect(infoSpy).toHaveBeenNthCalledWith(1, "Asking question: @UbiquityOS what is pi?");
    expect(infoSpy).toHaveBeenNthCalledWith(2, "Sending chat to OpenAI", {
      caller: LOG_CALLER,
      chat: [
        {
          role: "system",
          content: systemMsg,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    expect(infoSpy).toHaveBeenNthCalledWith(3, "Answer: This is a mock answer for the chat", {
      caller: LOG_CALLER,
      tokenUsage: {
        input: 1000,
        output: 150,
        total: 1150,
      },
    });
  });

  it("should collect the linked issues correctly", async () => {
    const ctx = createContext(TEST_SLASH_COMMAND);
    const infoSpy = jest.spyOn(ctx.logger, "info");
    createComments([
      transformCommentTemplate(1, 1, "More context here #2", "ubiquity", "test-repo", true),
      transformCommentTemplate(2, 1, TEST_QUESTION, "ubiquity", "test-repo", true),
      transformCommentTemplate(3, 2, "More context here #3", "ubiquity", "test-repo", true),
      transformCommentTemplate(4, 3, "Just a comment", "ubiquity", "test-repo", true),
    ]);

    await runPlugin(ctx);

    expect(infoSpy).toHaveBeenCalledTimes(3);

    expect(infoSpy).toHaveBeenNthCalledWith(1, "Asking question: @UbiquityOS what is pi?");

    const prompt = `=== Current Issue #1 Specification === ubiquity/test-repo/1 ===

This is a demo spec for a demo task just perfect for testing.
=== End Current Issue #1 Specification ===

=== Current Issue #1 Conversation === ubiquity/test-repo #1 ===

1 ubiquity: More context here #2
2 ubiquity: what is pi?
=== End Current Issue #1 Conversation ===

=== Linked Issue #2 Specification === ubiquity/test-repo/2 ===

Related to issue #3
=== End Linked Issue #2 Specification ===

=== Linked Issue #2 Conversation === ubiquity/test-repo #2 ===

3 ubiquity: More context here #3
=== End Linked Issue #2 Conversation ===

=== Linked Issue #3 Specification === ubiquity/test-repo/3 ===

Just another issue
=== End Linked Issue #3 Specification ===

=== Linked Issue #3 Conversation === ubiquity/test-repo #3 ===

4 ubiquity: Just a comment
=== End Linked Issue #3 Conversation ===\n
`;

    expect(infoSpy).toHaveBeenNthCalledWith(2, "Sending chat to OpenAI", {
      caller: LOG_CALLER,
      chat: [
        {
          role: "system",
          content: systemMsg,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });
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
    html_url: "https://www.github.com/ubiquity/test-repo/issues/1",
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

  db.issue.create({
    ...issueTemplate,
    id: 2,
    number: 2,
    body: "Related to issue #3",
  });

  db.issue.create({
    ...issueTemplate,
    id: 3,
    number: 3,
    body: "Just another issue",
  });
}

function createComments(comments: Comment[]) {
  for (const comment of comments) {
    db.comments.create({
      ...comment,
    });
  }
}

function createContext(body = TEST_SLASH_COMMAND) {
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
      ubiquity_os_app_slug: "UbiquityOS",
    },
    env: {
      OPENAI_API_KEY: "test",
    },
    octokit: new octokit.Octokit(),
    eventName: "issue_comment.created" as SupportedEventsU,
  } as unknown as Context;
}
