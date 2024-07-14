import { RestEndpointMethodTypes } from "@octokit/rest";
import { Context } from "./context";

export type Issue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
export type IssueComments = RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"];
export type ReviewComments = RestEndpointMethodTypes["pulls"]["listReviewComments"]["response"]["data"];
export type IssueComment = RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"][0];
export type ReviewComment = RestEndpointMethodTypes["pulls"]["listReviewComments"]["response"]["data"][0];

export type FetchParams = {
  context: Context;
  issueNum?: number;
  owner?: string;
  repo?: string;
};
export type LinkedIssues = {
  issueNumber: number;
  repo: string;
  owner: string;
  url: string;
  comments?: IssueComments | ReviewComments;
  body?: string;
};
