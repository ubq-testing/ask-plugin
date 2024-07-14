import OpenAI from "openai";
import { Context } from "../types";
import { recursivelyFetchLinkedIssues } from "../utils/issue";

import { createChatHistory, formatChatHistory } from "../utils/format-chat-history";
import { addCommentToIssue } from "./add-comment";

export async function askQuestion(context: Context, question: string) {
  const { logger } = context;

  if (!question) {
    logger.error(`No question provided`);
    await addCommentToIssue(context, "No question provided", true, "error");
    return;
  }

  const { specAndBodies, streamlinedComments } = await recursivelyFetchLinkedIssues({ context });

  const formattedChat = await formatChatHistory(context, streamlinedComments, specAndBodies);

  return await askGpt(context, formattedChat);
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
