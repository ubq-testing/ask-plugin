import { Context, SupportedEvents } from "../types";
import { CallbackResult } from "../types/proxy";
import { askQuestion } from "./ask-llm";
import { handleLlmQueryOutput } from "./llm-query-output";

export async function issueCommentCreatedCallback(
  context: Context<"issue_comment.created", SupportedEvents["issue_comment.created"]>
): Promise<CallbackResult> {
  const {
    logger,
    env: { UBIQUITY_OS_APP_NAME },
  } = context;
  const question = context.payload.comment.body;
  const slugRegex = new RegExp(`@${UBIQUITY_OS_APP_NAME} `, "gi");
  if (!question.match(slugRegex)) {
    return { status: 204, reason: logger.info("Comment does not mention the app. Skipping.").logMessage.raw };
  }
  if (context.payload.comment.user?.type === "Bot") {
    return { status: 204, reason: logger.info("Comment is from a bot. Skipping.").logMessage.raw };
  }
  if (question.replace(slugRegex, "").trim().length === 0) {
    return { status: 204, reason: logger.info("Comment is empty. Skipping.").logMessage.raw };
  }
  logger.info(`Asking question: ${question}`);
  return await handleLlmQueryOutput(context, await askQuestion(context, question));
}
