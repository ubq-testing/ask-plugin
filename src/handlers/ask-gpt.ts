import OpenAI from "openai";
import { Context } from "../types";
import { createChatHistory, formatChatHistory } from "../helpers/format-chat-history";
import { recursivelyFetchLinkedIssues } from "../helpers/issue-fetching";

export async function askQuestion(context: Context, question: string) {
  if (!question) {
    throw context.logger.error(`No question provided`);
  }

  const { specAndBodies, streamlinedComments } = await recursivelyFetchLinkedIssues({ context });

  const formattedChat = await formatChatHistory(context, streamlinedComments, specAndBodies);
  return await askGpt(context, formattedChat);
}

export async function askGpt(context: Context, formattedChat: string) {
  const {
    logger,
    env: { OPENAI_API_KEY },
  } = context;

  const openAi = new OpenAI({ apiKey: OPENAI_API_KEY });

  const chat = createChatHistory(formattedChat);

  logger.info(`Sending chat to OpenAI`, { chat });

  const res: OpenAI.Chat.Completions.ChatCompletion = await openAi.chat.completions.create({
    messages: createChatHistory(formattedChat),
    model: "chatgpt-4o-latest",
  });

  const answer = res.choices[0].message.content;

  const tokenUsage = {
    output: res.usage?.completion_tokens,
    input: res.usage?.prompt_tokens,
    total: res.usage?.total_tokens,
  };

  return { answer, tokenUsage };
}
