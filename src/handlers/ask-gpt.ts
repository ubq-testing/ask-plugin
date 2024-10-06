import OpenAI from "openai";
import { Context } from "../types";
import { createChatHistory, formatChatHistory } from "../helpers/format-chat-history";
import { recursivelyFetchLinkedIssues } from "../helpers/issue-fetching";
import { addCommentToIssue } from "./add-comment";

export async function askQuestion(context: Context, question: string) {
  if (!question) {
    throw context.logger.error(`No question provided`);
  }

  const { specAndBodies, streamlinedComments } = await recursivelyFetchLinkedIssues({ context });

  const embeddings = await fetchEmbeddingsContext(context, question);
  let embeddingContext: null | string = null;

  if (embeddings.length > 0) {
    // TODO: config items for how many embeddings refs to use
    // using the top for now
    embeddingContext = embeddings[0].content_plaintext;
  }

  const debugMsg = `
  <details> <summary> top ranked embeddings </summary>
  \`\`\`json
  ${JSON.stringify(embeddings, null, 2)}
  \`\`\`
  </details>`

  await addCommentToIssue(context, debugMsg);
  const formattedChat = await formatChatHistory(context, streamlinedComments, specAndBodies, embeddingContext);

  const chatDebugMsg = `
  <details> <summary> chat history </summary>
  \`\`\`json
  ${JSON.stringify(formattedChat, null, 2)}
  \`\`\`
  </details>`

  await addCommentToIssue(context, chatDebugMsg);
  return await askGpt(context, formattedChat);
}

async function fetchEmbeddingsContext(context: Context, query: string) {
  const { adapters: { supabase } } = context;

  const embeddings = await supabase.embeddings.findRelevantContext(query, 0.6);

  const sorted = embeddings.sort((a, b) => b.similarity - a.similarity);

  return sorted.slice(0, 3)
}

export async function askGpt(context: Context, formattedChat: string) {
  const {
    logger,
    env: { OPENAI_API_KEY },
    config: { model, openAiBaseUrl },
  } = context;

  const openAi = new OpenAI({
    apiKey: OPENAI_API_KEY,
    ...(openAiBaseUrl && { baseURL: openAiBaseUrl }),
  });

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
