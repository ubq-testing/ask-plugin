import { Octokit } from "@octokit/rest";
import { EmitterWebhookEvent as WebhookEvent, EmitterWebhookEventName as WebhookEventName } from "@octokit/webhooks";
import { PluginSettings } from "./plugin-inputs";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Env } from "./env";

export type SupportedEventsU = "issue_comment.created";

export type SupportedEvents = {
  [K in SupportedEventsU]: K extends WebhookEventName ? WebhookEvent<K> : never;
};

export interface Context<T extends SupportedEventsU = SupportedEventsU, TU extends SupportedEvents[T] = SupportedEvents[T]> {
  eventName: T;
  payload: TU["payload"];
  octokit: InstanceType<typeof Octokit>;
  config: PluginSettings;
  logger: Logs;
  env: Env;
}
