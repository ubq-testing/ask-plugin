import { Octokit } from "@octokit/rest";
import { Env, PluginInputs } from "./types";
import { Context } from "./types";
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

  if (context.eventName === "issue_comment.created") {
    // do something
    const comment = context.payload.comment.body;
    if (!comment.startsWith("/gpt")) {
      context.logger.info("Comment does not start with /gpt. Skipping.");
      return;
    }

    const { isEnabled } = context.config;

    if (!isEnabled) {
      context.logger.info("Plugin is disabled. Skipping.");
      await addCommentToIssue(context, "The /gpt command is disabled. Enable it in the plugin settings.", true, "warning");
      return;
    }









  } else {
    context.logger.error(`Unsupported event: ${context.eventName}`);
  }
}
