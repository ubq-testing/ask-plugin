import { Octokit } from "@octokit/rest";
import { PluginInputs, SupportedEventsU } from "./types";
import { Context } from "./types";
import { askQuestion } from "./handlers/ask-gpt";
import { addCommentToIssue } from "./handlers/add-comment";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";

export async function setupAndRun(inputs: PluginInputs) {
  const octokit = new Octokit({ auth: inputs.authToken });

  const context: Context = {
    eventName: inputs.eventName,
    payload: inputs.eventPayload,
    config: inputs.settings,
    octokit,
    logger: new Logs("info"),
  };

  return await plugin(context);
}

/**
 * How a worker executes the plugin.
 */
export async function plugin(context: Context) {
  const {
    logger,
    config: { isEnabled },
  } = context;

  if (isSupportedEvent(context.eventName)) {
    const comment = context.payload.comment.body;

    if (!comment.startsWith("/gpt")) {
      logger.info("Comment does not start with /gpt. Skipping.");
      return;
    }

    if (context.payload.comment.user?.type === "Bot") {
      logger.info("Comment is from a bot. Skipping.");
      return;
    }

    if (!isEnabled) {
      const log = logger.info("The /gpt command is disabled. Enable it in the plugin settings.");
      await addCommentToIssue(context, log?.logMessage.diff as string);
      return;
    }

    const question = comment.slice(4).trim();

    logger.info(`Asking question: ${question}`);
    const response = await askQuestion(context, question);

    if (response) {
      const { answer, tokenUsage } = response;
      if (!answer) {
        logger.error(`No answer from OpenAI`);
        return;
      }
      logger.info(`Answer: ${answer}`, { tokenUsage });
      await addCommentToIssue(context, answer);
    } else {
      logger.error(`No response from OpenAI`);
    }
  } else {
    logger.error(`Unsupported event: ${context.eventName}`);
  }
}

function isSupportedEvent(eventName: string): eventName is SupportedEventsU {
  return eventName === "issue_comment.created";
}
