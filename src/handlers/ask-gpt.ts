import { Context } from "../types";
import { CompletionsType } from "../adapters/openai/helpers/completions";
import { CommentType } from "../adapters/supabase/helpers/comment";

export async function askQuestion(context: Context, question: string) {
  if (!question) {
    throw context.logger.error(`No question provided`);
  }
  //TODO: Temporary workaround
  //const { specAndBodies, streamlinedComments } = await recursivelyFetchLinkedIssues({ context });
  //const formattedChat = await formatChatHistory(context, streamlinedComments, specAndBodies);
  return await askGpt(context, question);
}

export async function askGpt(context: Context, question: string): Promise<CompletionsType> {
  const {
    config: { model, similarityThreshold },
  } = context;
  //Fetch Similar Text
  const similarComments = (await context.adapters.supabase.comment.findSimilarComments(question, similarityThreshold, "")) || [];
  const similarIssues = (await context.adapters.supabase.issue.findSimilarIssues(question, similarityThreshold, "")) || [];
  //Create a new object with plain text from both the objects
  const similarText = similarComments.map((comment: CommentType) => comment.plaintext);
  similarText.push(...similarIssues.map((issue) => issue.issue_plaintext));
  //Rerank Similar Comments and Issues
  const rerankedText = await context.adapters.voyage.reranker.reRankResults(similarText, question);
  //TODO: Temporary workaround
  //const chat = createChatHistory(formattedChat);
  //logger.info(`Sending chat to OpenAI`, { chat });
  return context.adapters.openai.completions.createCompletion(question, model, rerankedText);
}
