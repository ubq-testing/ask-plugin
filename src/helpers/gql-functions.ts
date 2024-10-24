import { Octokit } from "@octokit/rest";
import { closedByPullRequestsReferences, IssueLinkedToPr } from "./gql-queries";

export async function collectIssuesToBeClosedByThisPr(
    octokit: Octokit,
    issue: {
        owner: string;
        repo: string;
        issue_number: number;
    }
) {
    const { owner, repo, issue_number } = issue;

    if (!issue_number) {
        throw new Error("[collectIssuesToBeClosedByThisPr]: issue_number is required");
    }
    try {
        const result = await octokit.graphql<IssueLinkedToPr>(closedByPullRequestsReferences, {
            owner,
            repo,
            issue_number,
        });

        return result.repository.issue.closedByPullRequestsReferences.edges.map((edge) => edge.node);
    } catch {
        // probably not found/deleted
        return [];
    }
}
