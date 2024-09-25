import OpenAI from "openai";
import { Context } from "../types";

import { createChatHistory, formatChatHistory } from "../helpers/format-chat-history";
import { addCommentToIssue } from "./add-comment";
import { recursivelyFetchLinkedIssues } from "../helpers/issue-fetching";

export async function askQuestion(context: Context, question: string) {
  if (!question) {
    await addCommentToIssue(context, context.logger.error(`No question provided`).logMessage.diff);
    return;
  }

  const { specAndBodies, streamlinedComments } = await recursivelyFetchLinkedIssues({ context });
  const formattedChat = await formatChatHistory(context, streamlinedComments, specAndBodies);

  return await askGpt(context, formattedChat);
}

export async function askGpt(context: Context, formattedChat: string) {
  const {
    logger,
    env: { openAi_apiKey },
  } = context;

  if (!openAi_apiKey) {
    await addCommentToIssue(context, logger.error(`No OpenAI API Key detected!`).logMessage.diff);
    return;
  }

  const openAi = new OpenAI({ apiKey: openAi_apiKey });

  const chat = createChatHistory(formattedChat);

  logger.info(`Sending chat to OpenAI`, { chat });

  const res: OpenAI.Chat.Completions.ChatCompletion = await openAi.chat.completions.create({
    messages: createChatHistory(formattedChat),
    model: "chatgpt-4o-latest",
  });

  if (!res.choices) {
    await addCommentToIssue(context, logger.error(`No response from OpenAI`).logMessage.diff);
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
