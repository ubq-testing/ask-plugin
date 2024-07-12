import { Context } from "../types/context";

const diffStyles = {
    warning: "```diff\n! ",
    error: "```diff\n- ",
    success: "```diff\n+ ",
    info: "```diff\n# ",
};

export async function addCommentToIssue(context: Context, message: string, diff = false, diffStyle?: keyof typeof diffStyles) {
    const { payload } = context;
    const issueNumber = payload.issue.number;

    if (diff && diffStyle) {
        message = `${diffStyles[diffStyle]}${message}\n\`\`\``;
    }

    try {
        await context.octokit.issues.createComment({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            issue_number: issueNumber,
            body: message,
        });
    } catch (e: unknown) {
        context.logger.fatal("Adding a comment failed!", e);
    }
}
