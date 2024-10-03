import { ChatCompletionMessageParam } from "openai/resources";
import { Context } from "../types";
import { StreamlinedComment, StreamlinedComments } from "../types/gpt";
import { createKey, streamlineComments } from "../handlers/comments";
import { fetchPullRequestDiff, fetchIssue, fetchIssueComments } from "./issue-fetching";
import { splitKey } from "./issue";

export async function formatChatHistory(context: Context, streamlined: Record<string, StreamlinedComment[]>, specAndBodies: Record<string, string>) {
  const convoKeys = Object.keys(streamlined);
  const specAndBodyKeys = Object.keys(specAndBodies);
  const chatHistory: string[] = [];
  const currentIssueKey = createKey(context.payload.issue.html_url);
  const keys: string[] = Array.from(new Set([...convoKeys, ...specAndBodyKeys, currentIssueKey]));

  for (const key of keys) {
    const isCurrentIssue = key === currentIssueKey;
    const block = await createContextBlockSection(context, key, streamlined, specAndBodies, isCurrentIssue);
    chatHistory.push(block);
  }

  return Array.from(new Set(chatHistory)).join("");
}

function getCorrectHeaderString(isPull: string | null, issueNumber: number, isCurrentIssue: boolean, isBody: boolean) {
  const strings = {
    pull: {
      linked: `Linked Pull #${issueNumber} Request`,
      current: `Current Pull #${issueNumber} Request`,
    },
    issue: {
      linked: `Linked Issue #${issueNumber} Specification`,
      current: `Current Issue #${issueNumber} Specification`,
    },
    convo: {
      linked: `Linked Issue #${issueNumber} Conversation`,
      current: `Current Issue #${issueNumber} Conversation`,
    },
  };

  let header = "";

  if (isPull) {
    header = isCurrentIssue ? strings.pull.current : strings.pull.linked;
  } else {
    header = isCurrentIssue ? strings.issue.current : strings.issue.linked;
  }

  if (isBody) {
    header = isCurrentIssue ? strings.convo.current : strings.convo.linked;
  }

  return header;
}

async function createContextBlockSection(
  context: Context,
  key: string,
  streamlined: Record<string, StreamlinedComment[]>,
  specAndBodies: Record<string, string>,
  isCurrentIssue: boolean
) {
  let comments = streamlined[key];

  if (!comments || comments.length === 0) {
    const [owner, repo, number] = splitKey(key);
    const { comments: comments_ } = await fetchIssueComments({
      context,
      owner,
      repo,
      issueNum: parseInt(number),
    });

    comments = streamlineComments(comments_)[key];
  }

  const [org, repo, issueNum] = key.split("/");

  const issueNumber = parseInt(issueNum);
  const prDiff = await fetchPullRequestDiff(context, org, repo, issueNumber);

  if (!issueNumber || isNaN(issueNumber)) {
    throw context.logger.error("Issue number is not valid");
  }

  const specHeader = getCorrectHeaderString(prDiff, issueNumber, isCurrentIssue, false);

  let specOrBody = specAndBodies[key];
  if (!specOrBody) {
    specOrBody =
      (
        await fetchIssue({
          context,
          owner: org,
          repo,
          issueNum: issueNumber,
        })
      )?.body || "No specification or body available";
  }
  const specOrBodyBlock = [createHeader(specHeader, key), createSpecOrBody(specOrBody), createFooter(specHeader)];

  const header = getCorrectHeaderString(prDiff, issueNumber, isCurrentIssue, true);
  const repoString = `${org}/${repo} #${issueNumber}`;

  const block = [specOrBodyBlock.join(""), createHeader(header, repoString), createComment({ issueNumber, repo, org, comments }), createFooter(header)];

  if (!prDiff) {
    return block.join("");
  }

  const diffBlock = [createHeader("Linked Pull Request Code Diff", repoString), prDiff, createFooter("Linked Pull Request Code Diff")];

  return block.concat(diffBlock).join("");
}

function createHeader(content: string, repoString: string) {
  return `=== ${content} === ${repoString} ===\n\n`;
}

function createFooter(content: string) {
  return `=== End ${content} ===\n\n`;
}

function createComment(comment: StreamlinedComments) {
  if (!comment.comments) {
    return "";
  }
  const comments = [];

  // filter dupes
  comment.comments = comment.comments?.filter((c, i, a) => a.findIndex((cc) => cc.id === c.id) === i);

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
Use GitHub flavoured markdown in your response making effective use of lists, code blocks and other supported GitHub md features.`,
  };

  const userMessage: ChatCompletionMessageParam = {
    role: "user",
    content: formattedChat,
  };

  chatHistory.push(systemMessage, userMessage);

  return chatHistory;
}
