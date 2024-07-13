import { ChatCompletionMessageParam } from "openai/resources";
import { Context } from "../types";
import { StreamlinedComment, StreamlinedComments } from "../types/gpt";
import { fetchPullRequestDiff } from "./issue";

export function formatChatHistory(
  context: Context,
  streamlined: Record<string, StreamlinedComment[]>,
  specAndBodies: Record<string, string>,
  linkedPulls: Record<string, boolean>
) {
  const convoKeys = Object.keys(streamlined);
  const specAndBodyKeys = Object.keys(specAndBodies);

  const curIssue = {
    convo: streamlined[convoKeys[0]],
    specOrBody: specAndBodies[specAndBodyKeys[0]],
  };

  const issueSpecBlock: string[] = [
    createHeader("Project Specification", specAndBodyKeys[0]),
    createSpecOrBody(curIssue.specOrBody),
    createFooter("Project Specification")
  ]

  const issueCommentBlock: string[] = [
    createHeader("Issue Conversation", convoKeys[0]),
    createComment({
      issue: parseInt(convoKeys[0].split("/")[2]),
      repo: convoKeys[0].split("/")[1],
      org: convoKeys[0].split("/")[0],
      comments: curIssue.convo,
    }),
    createFooter("Issue Conversation")
  ];

  delete convoKeys[0];

  const linkedContextBlocks = convoKeys.map(async (key) => {
    const comments = streamlined[key];
    const [org, repo, _issues, issue] = key.split("/");
    const isPull = linkedPulls[key];
    const specHeader = isPull ? `Linked Pull #${issue} Request Body` : `Linked Issue #${issue} Specification`;

    const specOrBody = specAndBodies[key];
    const specOrBodyBlock = [
      createHeader(specHeader, key),
      createSpecOrBody(specOrBody),
      createFooter(specHeader)
    ]

    const header = isPull ? `Linked Pull #${issue} Request Conversation` : `Linked Issue #${issue} Conversation`;
    const repoString = `${org}/${repo} #${issue}`;
    const diff = isPull ? await fetchPullRequestDiff(context, org, repo, issue) : null;

    const block = [
      specOrBodyBlock.join(""),
      createHeader(header, repoString),
      createComment({ issue: parseInt(issue), repo, org, comments }),
      createFooter(header)
    ]

    if (!isPull) {
      return block.join("");
    }

    const diffBlock = [
      createHeader("Linked Pull Request Code Diff", repoString),
      diff ? diff : "No diff available",
      createFooter("Linked Pull Request Code Diff")
    ]

    return block.join("") + diffBlock.join("");
  });

  return issueSpecBlock.join("") + issueCommentBlock.join("") + linkedContextBlocks.join("");
}

function createHeader(content: string, repoString: string) {
  return `=== ${content} === ${repoString} ===\n\n`;
}

function createFooter(content: string) {
  return `=== End ${content} ===\n\n`;
}

function createComment(comment: StreamlinedComments) {
  const comments = []
  for (const c of comment.comments) {
    comments.push(`${c.id} ${c.user}: ${c.body}\n`);
  }
  return comments.join("");
}

function createSpecOrBody(specOrBody: string) {
  return `${specOrBody}\n`;
}

export function createChatHistory(formattedChat: string) {
  const chatHistory: ChatCompletionMessageParam[] = [];

  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: `You are a GitHub integrated chatbot tasked with assisting in research and discussion on GitHub issues and pull requests.
        Using the provided context, address the question being asked providing a clear and concise answer with no follow-up statements.
        The LAST comment in 'Issue Conversation' is the most recent one, focus on it as that is the question being asked.
        Use GitHub flavoured markdown in your response making effective use of lists, code blocks and other supported GitHub md features.`.trim(),
  };

  const userMessage: ChatCompletionMessageParam = {
    role: "user",
    content: formattedChat,
  };

  chatHistory.push(systemMessage, userMessage);

  return chatHistory;
}
