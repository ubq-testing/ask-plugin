import { Octokit } from "@octokit/rest";
import { EmitterWebhookEvent as WebhookEvent, EmitterWebhookEventName as WebhookEventName } from "@octokit/webhooks";
import { Env } from "./env";
import { PluginSettings } from "./plugin-inputs";

export type SupportedEventsU = "issue_comment.created";

export type SupportedEvents = {
  [K in SupportedEventsU]: K extends WebhookEventName ? WebhookEvent<K> : never;
};

export interface Context<T extends SupportedEventsU = SupportedEventsU, TU extends SupportedEvents[T] = SupportedEvents[T]> {
  eventName: T;
  payload: TU["payload"];
  octokit: InstanceType<typeof Octokit>;
  adapters: never;
  config: PluginSettings;
  env: Env;
  logger: {
    fatal: (message: unknown, ...optionalParams: unknown[]) => void;
    error: (message: unknown, ...optionalParams: unknown[]) => void;
    warn: (message: unknown, ...optionalParams: unknown[]) => void;
    info: (message: unknown, ...optionalParams: unknown[]) => void;
    debug: (message: unknown, ...optionalParams: unknown[]) => void;
  };
}
