import { Octokit } from "@octokit/rest";
import { PluginInputs, SupportedEventsU } from "./types";
import { Context } from "./types";
import { askQuestion } from "./handlers/ask-gpt";
import { addCommentToIssue } from "./handlers/add-comment";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Env } from "./types/env";

export async function plugin(inputs: PluginInputs, env: Env) {
  const octokit = new Octokit({ auth: inputs.authToken });

  const context: Context = {
    eventName: inputs.eventName,
    payload: inputs.eventPayload,
    config: inputs.settings,
    octokit,
    env,
    logger: new Logs("debug"),
  };

  return runPlugin(context);
}

export async function runPlugin(context: Context) {
  const {
    logger,
    config: { ubiquity_os_app_slug },
  } = context;

  if (isSupportedEvent(context.eventName)) {
    const comment = context.payload.comment.body;

    if (!comment.startsWith(`@${ubiquity_os_app_slug} `)) {
      return;
    }

    if (context.payload.comment.user?.type === "Bot") {
      logger.info("Comment is from a bot. Skipping.");
      return;
    }

    const question = comment.replace(`@${ubiquity_os_app_slug}`, "").trim();

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
