import { Octokit } from "@octokit/rest";
import { PluginInputs } from "./types";
import { Context } from "./types";
import { askQuestion } from "./handlers/ask-gpt";
import { addCommentToIssue } from "./handlers/add-comment";
import { LogReturn, Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Env } from "./types/env";
import { createClient } from "@supabase/supabase-js";
import { createAdapters } from "./adapters";
import { VoyageAIClient } from "voyageai";

export async function plugin(inputs: PluginInputs, env: Env) {
  const octokit = new Octokit({ auth: inputs.authToken });
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
  const voyage = new VoyageAIClient({
    apiKey: env.VOYAGEAI_API_KEY
  });

  const context: Context = {
    eventName: inputs.eventName,
    payload: inputs.eventPayload,
    config: inputs.settings,
    octokit,
    env,
    logger: new Logs("debug"),
    adapters: {} as Awaited<ReturnType<typeof createAdapters>>,
  };

  context.adapters = createAdapters(client, voyage, context);

  return await runPlugin(context);
}

export async function runPlugin(context: Context) {
  const {
    logger,
    env: { UBIQUITY_OS_APP_SLUG },
  } = context;
  const question = context.payload.comment.body;

  const slugRegex = new RegExp(`^@${UBIQUITY_OS_APP_SLUG} `, "i");

  if (!question.match(slugRegex)) {
    logger.info("Comment does not mention the app. Skipping.");
    return;
  }

  if (context.payload.comment.user?.type === "Bot") {
    logger.info("Comment is from a bot. Skipping.");
    return;
  }

  if (question.replace(slugRegex, "").trim().length === 0) {
    logger.info("Comment is empty. Skipping.");
    return;
  }

  logger.info(`Asking question: ${question}`);
  let commentToPost = "";

  try {
    const response = await askQuestion(context, question);
    const { answer, tokenUsage } = response;

    if (!answer) {
      throw logger.error(`No answer from OpenAI`);
    }

    logger.info(`Answer: ${answer}`, { tokenUsage });

    const tokens = `\n\n<!--\n${JSON.stringify(tokenUsage, null, 2)}\n--!>`;

    commentToPost = answer + tokens;
  } catch (err) {
    let errorMessage;
    if (err instanceof LogReturn) {
      errorMessage = err;
    } else if (err instanceof Error) {
      errorMessage = context.logger.error(err.message, { error: err, stack: err.stack });
    } else {
      errorMessage = context.logger.error("An error occurred", { err });
    }
    commentToPost = `${errorMessage?.logMessage.diff}\n<!--\n${sanitizeMetadata(errorMessage?.metadata)}\n-->`;
  }

  await addCommentToIssue(context, commentToPost);
}
function sanitizeMetadata(obj: LogReturn["metadata"]): string {
  return JSON.stringify(obj, null, 2).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/--/g, "&#45;&#45;");
}
