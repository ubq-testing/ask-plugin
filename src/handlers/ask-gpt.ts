import OpenAI from "openai";
import { Context } from "../types";
import { fetchIssue, fetchIssueComments, getLinkedIssueContextFromComments, idIssueFromComment } from "../utils/issue";
import { IssueComments } from "../types/github";
import { StreamlinedComment } from "../types/gpt";
import { createChatHistory, formatChatHistory } from "../utils/format-chat-history";
import { addCommentToIssue } from "./add-comment";

export async function askQuestion(context: Context, question: string) {
  const {
    logger,
    payload: { issue: currentIssue },
    config: { linkedIssueFetchDepth },
  } = context;

  if (!question) {
    logger.error(`No question provided`);
    await addCommentToIssue(context, "No question provided", true, "error");
    return;
  }

  const { body: issueSpecOrPullBody, repository_url } = currentIssue;
  const org = repository_url.split("/")[4];

  const { specReferencedIssueBody, specReferencedIssueKey, streamlinedSpecReferencedIssueComments } = await getSpecReferencedContext(
    context,
    org,
    issueSpecOrPullBody
  );

  const issueComments = await fetchIssueComments({ context });
  const linkedIssueContext = await getLinkedIssueContextFromComments(context, issueComments, linkedIssueFetchDepth);
  const { linkedIssues, linkedIssueComments } = linkedIssueContext;

  // we are only going one level deep with the linked issue context fetching
  for (const issue of linkedIssues) {
    const fetched = await fetchIssueComments({ context, issueNum: issue.issueNumber, repo: issue.repo });
    linkedIssueComments.push(...fetched);
  }

  const streamlinedComments = await getAllStreamlinedComments(issueComments, streamlinedSpecReferencedIssueComments, linkedIssueComments);
  const { linkedPulls, specAndBodies } = await getSpecBodiesAndLinkedPulls(
    context,
    repository_url,
    currentIssue.number,
    issueSpecOrPullBody,
    specReferencedIssueBody,
    specReferencedIssueKey,
    linkedIssues
  );
  const formattedChat = formatChatHistory(context, streamlinedComments, specAndBodies, linkedPulls);

  logger.info(`Formatted chat history`, { formattedChat });

  return await askGpt(context, formattedChat);
}

async function getAllStreamlinedComments(
  issueComments: IssueComments,
  streamlinedSpecReferencedIssueComments: Record<string, StreamlinedComment[]> | undefined,
  linkedIssueComments: IssueComments
) {
  const streamlinedComments = streamlineComments(issueComments) ?? {};

  if (streamlinedSpecReferencedIssueComments && Object.keys(streamlinedSpecReferencedIssueComments).length > 0) {
    for (const [key, value] of Object.entries(streamlinedSpecReferencedIssueComments)) {
      if (!streamlinedComments[key]) {
        streamlinedComments[key] = value;
        continue;
      }

      const previous = streamlinedComments[key] || [];
      streamlinedComments[key] = [...previous, ...value];
    }
  }

  if (linkedIssueComments.length > 0) {
    const linkedStreamlinedComments = streamlineComments(linkedIssueComments);

    if (linkedStreamlinedComments) {
      for (const [key, value] of Object.entries(linkedStreamlinedComments)) {
        if (!streamlinedComments[key]) {
          streamlinedComments[key] = value;
          continue;
        }

        const previous = streamlinedComments[key] || [];
        streamlinedComments[key] = [...previous, ...value];
      }
    }
  }

  return streamlinedComments;
}

async function getSpecBodiesAndLinkedPulls(
  context: Context,
  currentIssueUrl: string,
  currentIssueNumber: number,
  issueSpecOrPullBody: string | null,
  specReferencedIssueBody: string | null | undefined,
  specReferencedIssueKey: string | null | undefined,
  linkedIssues: { issueNumber: number; repo: string }[]
) {
  const linkedPulls: Record<string, boolean> = {};
  const currentIssueKey = createKey(currentIssueUrl, currentIssueNumber);
  // collect specifically all of the spec and PR bodies
  const specAndBodies: Record<string, string> = {};
  specAndBodies[currentIssueKey] = issueSpecOrPullBody || "";
  specAndBodies[specReferencedIssueKey as string] = specReferencedIssueBody || "";

  for (const linkedIssue of linkedIssues) {
    const issue = await fetchIssue({ context, issueNum: linkedIssue.issueNumber, repo: linkedIssue.repo });
    const { body, repository_url, pull_request } = issue;
    const linkedIssueKey = createKey(repository_url, linkedIssue.issueNumber);
    specAndBodies[linkedIssueKey] = body || "";

    if (pull_request) {
      linkedPulls[linkedIssueKey] = true;
    }
  }

  return { specAndBodies, linkedPulls };
}

async function getSpecReferencedContext(context: Context, org: string, issueSpecOrPullBody: string | null) {
  // fetch the spec referenced issue if it exists
  const specReferencedIssueId = idIssueFromComment(org, issueSpecOrPullBody);
  let specReferencedIssue,
    specReferencedIssueBody,
    specReferencedIssueRepoUrl,
    specReferencedIssueComments,
    specReferencedIssueKey,
    streamlinedSpecReferencedIssueComments;

  if (specReferencedIssueId) {
    specReferencedIssue = await fetchIssue({ context, issueNum: specReferencedIssueId.issueNumber });
    specReferencedIssueBody = specReferencedIssue.body;
    specReferencedIssueRepoUrl = specReferencedIssue.repository_url;
    specReferencedIssueComments = await fetchIssueComments({ context, issueNum: specReferencedIssueId.issueNumber, repo: specReferencedIssueId.repo });
    specReferencedIssueKey = createKey(specReferencedIssueRepoUrl, specReferencedIssueId?.issueNumber);
    streamlinedSpecReferencedIssueComments = streamlineComments(specReferencedIssueComments) ?? {};
  }

  return {
    specReferencedIssue,
    specReferencedIssueBody,
    specReferencedIssueRepoUrl,
    specReferencedIssueComments,
    specReferencedIssueKey,
    streamlinedSpecReferencedIssueComments,
  };
}

function createKey(issueUrl: string, issue?: number) {
  const splitUrl = issueUrl?.split("/");
  const issueNumber = issue || parseInt(splitUrl?.pop() || "");
  const issueRepo = splitUrl?.slice(-2).join("/");
  const issueOrg = splitUrl?.slice(-3, -2).join("/");

  if (issueOrg.startsWith("repos")) {
    return `${issueRepo}/issues/${issueNumber}`;
  }

  return `${issueOrg}/${issueRepo}/${issueNumber}`;
}

function streamlineComments(comments: IssueComments) {
  const streamlined: Record<string, StreamlinedComment[]> = {};

  for (const comment of comments) {
    const user = comment.user;
    if (user && user.type === "Bot") {
      continue;
    }

    const body = comment.body;
    const key = createKey(comment.issue_url);

    if (!streamlined[key]) {
      streamlined[key] = [];
    }

    if (user && body) {
      streamlined[key].push({
        user: user.login,
        body,
        id: comment.id,
      });
    }
  }
  return streamlined;
}

export async function askGpt(context: Context, formattedChat: string) {
  const {
    logger,
    config: { openAi_apiKey },
  } = context;

  if (!openAi_apiKey) {
    logger.error(`No OpenAI API Key provided`);
    await addCommentToIssue(context, "No OpenAI API Key detected!", true, "error"); // TOO confirm  correct style here
    return;
  }

  const openAi = new OpenAI({ apiKey: openAi_apiKey });

  const chat = createChatHistory(formattedChat);

  logger.info(`Sending chat to OpenAI`, { chat });

  const res: OpenAI.Chat.Completions.ChatCompletion = await openAi.chat.completions.create({
    messages: createChatHistory(formattedChat),
    model: "gpt-4o", // "gpt-4o
    temperature: 0,
  });

  if (!res.choices) {
    logger.error(`No response from OpenAI`);
    await addCommentToIssue(context, "No response from OpenAI", true, "error");
    return;
  }

  const answer = res.choices[0].message.content;

  const tokenUsage = {
    output: res.usage?.completion_tokens,
    input: res.usage?.prompt_tokens,
    total: res.usage?.total_tokens,
  };

  return { answer, tokenUsage };
}
