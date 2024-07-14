import { ChatCompletionMessageParam } from "openai/resources";
import { Context } from "../types";
import { StreamlinedComment, StreamlinedComments } from "../types/gpt";
import { fetchPullRequestDiff } from "./issue";
import { createKey } from "../handlers/comments";

export async function formatChatHistory(context: Context, streamlined: Record<string, StreamlinedComment[]>, specAndBodies: Record<string, string>) {
  const convoKeys = Object.keys(streamlined);
  const specAndBodyKeys = Object.keys(specAndBodies);
  const keys: string[] = Array.from(new Set([...convoKeys, ...specAndBodyKeys]));
  const chatHistory: string[] = [];

  for (const key of keys) {
    const isCurrentIssue = key === createKey(context.payload.issue.url, context.payload.issue.number);
    const block = await createContextBlockSection(context, key, streamlined, specAndBodies, isCurrentIssue);
    chatHistory.push(block);
  }

  return chatHistory.join("");
}

async function createContextBlockSection(
  context: Context,
  key: string,
  streamlined: Record<string, StreamlinedComment[]>,
  specAndBodies: Record<string, string>,
  isCurrentIssue: boolean
) {
  const comments = streamlined[key];
  const [org, repo, _issue, issue] = key.split("/");

  const issueNumber = parseInt(issue ?? _issue);
  const isPull = await fetchPullRequestDiff(context, org, repo, issueNumber);

  if (!issueNumber || isNaN(issueNumber)) {
    throw new Error("Issue number is not valid");
  }

  let specHeader = isPull ? `Linked Pull #${issueNumber} Request Body` : `Linked Issue #${issueNumber} Specification`;
  if (isCurrentIssue) {
    specHeader = isPull ? `Current Pull #${issueNumber} Request Body` : `Current Issue #${issueNumber} Specification`;
  }

  const specOrBody = specAndBodies[key];
  const specOrBodyBlock = [createHeader(specHeader, key), createSpecOrBody(specOrBody), createFooter(specHeader)];

  const header = isPull ? `Linked Pull #${issueNumber} Request Conversation` : `Linked Issue #${issueNumber} Conversation`;
  const repoString = `${org}/${repo} #${issueNumber}`;
  const diff = isPull ? await fetchPullRequestDiff(context, org, repo, issueNumber) : null;

  const block = [
    specOrBodyBlock.join(""),
    createHeader(header, repoString),
    createComment({ issue: parseInt(issue), repo, org, comments }),
    createFooter(header),
  ];

  if (!isPull) {
    return block.join("");
  }

  const diffBlock = [
    createHeader("Linked Pull Request Code Diff", repoString),
    diff ? diff : "No diff available",
    createFooter("Linked Pull Request Code Diff"),
  ];

  return block.concat(diffBlock).join("");
}

function createHeader(content: string, repoString: string) {
  return `=== ${content} === ${repoString} ===\n\n`;
}

function createFooter(content: string) {
  return `=== End ${content} ===\n\n`;
}

function createComment(comment: StreamlinedComments) {
  const comments = [];
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
