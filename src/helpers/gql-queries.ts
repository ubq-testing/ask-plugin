import { User, PullRequest } from "@octokit/graphql-schema";

type ClosedByPullRequestsReferences = {
  node: Pick<PullRequest, "url" | "title" | "number" | "state" | "body"> & Pick<User, "login" | "id">;
};

export type IssueLinkedToPr = {
  repository: {
    issue: {
      closedByPullRequestsReferences: {
        edges: ClosedByPullRequestsReferences[];
      };
    };
  };
};

export const closedByPullRequestsReferences = /* GraphQL */ `
  query collectLinkedPullRequests($owner: String!, $repo: String!, $issue_number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issue_number) {
        closedByPullRequestsReferences(first: 100, includeClosedPrs: true) {
          edges {
            node {
              url
              title
              body
              state
              number
              author {
                login
                ... on User {
                  id: databaseId
                }
              }
            }
          }
        }
      }
    }
  }
`;
