import OpenAI from "openai";
import { Context } from "../types";

import { createChatHistory, formatChatHistory } from "../utils/format-chat-history";
import { addCommentToIssue } from "./add-comment";
import { recursivelyFetchLinkedIssues } from "../utils/issue-fetching";

export async function askQuestion(context: Context, question: string) {
  if (!question) {
    const log = context.logger.error(`No question provided`);
    await addCommentToIssue(context, log?.logMessage.diff as string);
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
    const log = logger.error(`No OpenAI API Key detected!`);
    await addCommentToIssue(context, log?.logMessage.diff as string); // TOO confirm  correct style here
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
    const log = logger.error(`No response from OpenAI`);
    await addCommentToIssue(context, log?.logMessage.diff as string);
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
