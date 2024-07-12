import { RestEndpointMethodTypes } from "@octokit/rest";

export type Issue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
export type IssueComments = RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"];
