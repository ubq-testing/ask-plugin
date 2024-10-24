import { ResponseFromLlm } from "../adapters/openai/helpers/completions";
import { bubbleUpErrorComment } from "../helpers/errors";
import { Context } from "../types";
import { CallbackResult } from "../types/proxy";
import { addCommentToIssue } from "./add-comment";

export async function handleLlmQueryOutput(context: Context, llmResponse: ResponseFromLlm): Promise<CallbackResult> {
  const { logger } = context;
  try {
    const { answer, tokenUsage } = llmResponse;
    if (!answer) {
      throw logger.error(`No answer from OpenAI`);
    }
    logger.info(`Answer: ${answer}`, { tokenUsage });
    const tokens = `\n\n<!--\n${JSON.stringify(tokenUsage, null, 2)}\n--!>`;
    const commentToPost = answer + tokens;
    await addCommentToIssue(context, commentToPost);
    return { status: 200, reason: logger.info("Comment posted successfully").logMessage.raw };
  } catch (error) {
    throw await bubbleUpErrorComment(context, error, false);
  }
}
