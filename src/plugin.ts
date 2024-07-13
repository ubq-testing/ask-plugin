import { Octokit } from "@octokit/rest";
import { Env, PluginInputs, SupportedEventsU } from "./types";
import { Context } from "./types";
import { askQuestion } from "./handlers/ask-gpt";
import { addCommentToIssue } from "./handlers/add-comment";

/**
 * How a worker executes the plugin.
 */
export async function plugin(inputs: PluginInputs, env: Env) {
  const octokit = new Octokit({ auth: inputs.authToken });

  const context: Context = {
    eventName: inputs.eventName,
    payload: inputs.eventPayload,
    config: inputs.settings,
    octokit,
    env,
    logger: {
      debug(message: unknown, ...optionalParams: unknown[]) {
        console.debug(message, ...optionalParams);
      },
      info(message: unknown, ...optionalParams: unknown[]) {
        console.log(message, ...optionalParams);
      },
      warn(message: unknown, ...optionalParams: unknown[]) {
        console.warn(message, ...optionalParams);
      },
      error(message: unknown, ...optionalParams: unknown[]) {
        console.error(message, ...optionalParams);
      },
      fatal(message: unknown, ...optionalParams: unknown[]) {
        console.error(message, ...optionalParams);
      },
    },
    adapters: {} as never,
  };
  const { logger, config: { isEnabled } } = context;

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
      logger.info("Plugin is disabled. Skipping.");
      await addCommentToIssue(context, "The /gpt command is disabled. Enable it in the plugin settings.", true, "warning");
      return;
    }

    const question = comment.slice(4).trim();

    logger.info(`Asking question: ${question}`);
    const response = await askQuestion(context, question);

    if (response) {
      const { answer, tokenUsage } = response
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
