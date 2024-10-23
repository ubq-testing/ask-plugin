import { LogReturn, Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Context } from "../types";
import { addCommentToIssue } from "../handlers/add-comment";
export const logger = new Logs("debug");

export function handleUncaughtError(err: unknown) {
  logger.error("An uncaught error occurred", { err });
  return new Response(JSON.stringify({ err }), { status: 500, headers: { "content-type": "application/json" } });
}
export function sanitizeMetadata(obj: LogReturn["metadata"]): string {
  return JSON.stringify(obj, null, 2).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/--/g, "&#45;&#45;");
}

export async function bubbleUpErrorComment(context: Context, err: unknown, post = true): Promise<LogReturn> {
  let errorMessage;
  if (err instanceof LogReturn) {
    errorMessage = err;
  } else if (err instanceof Error) {
    errorMessage = context.logger.error(err.message, { error: err });
  } else {
    errorMessage = context.logger.error("An error occurred", { err });
  }

  if (post) {
    await addCommentToIssue(context, `${errorMessage?.logMessage.diff}\n<!--\n${sanitizeMetadata(errorMessage?.metadata)}\n-->`);
  }

  return errorMessage;
}
