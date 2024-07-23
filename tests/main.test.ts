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

type Comments = {
  id: number;
  user: string;
  body: string;
}[];


const octokit = jest.requireActual("@octokit/rest") as any;
jest.mock("openai", () => {
  return {
    OpenAi: class OpenAi {
      constructor() {
        return;
      }
      async chat() {
        return {
          choices: [
            {
              text: "This is a mock answer for the chat",
            },
          ],
        };
      }
    },
  };
});

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
    const ctx = createContext();
    const comments: Comments = [
      {
        id: 1,
        user: "ubiquity",
        body: "This is a test comment",
      },
    ];

    createComments("ubiquity", "test-repo", 1, 1, comments);
    const res = await askQuestion(ctx, "What is pi?");

    expect(res).toBeDefined();

    expect(res?.answer).toBe("This is a mock answer for the chat");
  });

});

// HELPERS

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


function createComments(owner: string, repo: string, id: number, issue_number: number, comments: Comments,) {
  db.comments.create({
    id,
    issue_number,
    owner,
    repo,
    comments,
  });
}

function createContext(body = "/gpt what is pi?", isEnabled = true, depth = 5) {
  const ctx = {
    payload: {
      issue: db.issue.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["issue"],
      sender: db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"],
      repository: db.repo.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["repository"],
      comment: { body } as unknown as Context["payload"]["comment"],
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

  return ctx;
}