import { ChatCompletionMessageParam } from "openai/resources";
import { Context } from "../types";
import { StreamlinedComment, StreamlinedComments } from "../types/gpt";
import { fetchPullRequestDiff } from "./issue";

export function formatChatHistory(context: Context, streamlined: Record<string, StreamlinedComment[]>, specAndBodies: Record<string, string>, linkedPulls: Record<string, boolean>) {
    const convoKeys = Object.keys(streamlined);
    const specAndBodyKeys = Object.keys(specAndBodies);

    const curIssue = {
        convo: streamlined[convoKeys[0]],
        specOrBody: specAndBodies[specAndBodyKeys[0]],
    }

    let issueSpecBlock = "";
    issueSpecBlock += createHeader("Project Specification", specAndBodyKeys[0]);
    issueSpecBlock += createSpecOrBody(curIssue.specOrBody);
    issueSpecBlock += createFooter("Project Specification");

    let issueCommentBlock = "";
    issueCommentBlock += createHeader("Issue Conversation", convoKeys[0]);
    issueCommentBlock += createComment({ issue: parseInt(convoKeys[0].split("/")[2]), repo: convoKeys[0].split("/")[1], org: convoKeys[0].split("/")[0], comments: curIssue.convo });
    issueCommentBlock += createFooter("Issue Conversation");

    delete convoKeys[0];

    const linkedContextBlocks = convoKeys.map((key) => {
        const comments = streamlined[key];
        const [org, repo, issues, issue] = key.split("/");
        const isPull = linkedPulls[key];
        const specHeader = isPull ? `Linked Pull #${issue} Request Body` : `Linked Issue #${issue} Specification`;

        const specOrBody = specAndBodies[key];
        let specOrBodyBlock = createHeader(specHeader, key);
        specOrBodyBlock += createSpecOrBody(specOrBody);
        specOrBodyBlock += createFooter(specHeader);

        const header = isPull ? `Linked Pull #${issue} Request Conversation` : `Linked Issue #${issue} Conversation`;
        const repoString = `${org}/${repo} #${issue}`;
        const diff = isPull ? fetchPullRequestDiff(context, org, repo, issue) : null;

        let block = ""
        block += specOrBodyBlock;
        block += createHeader(header, repoString);
        block += createComment({ issue: parseInt(issue), repo, org, comments });
        block += createFooter(header);

        if (!isPull) {
            return block;
        }

        let diffBlock = createHeader("Linked Pull Request Code Diff", repoString);
        diffBlock += diff ? diff : "No diff available";
        diffBlock += createFooter("Linked Pull Request Code Diff");
        return block + diffBlock;
    });


    return issueSpecBlock + issueCommentBlock + linkedContextBlocks.join("");
}

function createHeader(content: string, repoString: string) {
    return `=== ${content} === ${repoString} ===\n\n`
}

function createFooter(content: string) {
    return `=== End ${content} ===\n\n`
}

function createComment(comment: StreamlinedComments) {
    let comments = "";
    for (const c of comment.comments) {
        comments += `${c.id} ${c.user}: ${c.body}\n`;
    }
    return comments;
}

function createSpecOrBody(specOrBody: string) {
    return `${specOrBody}\n`
}

export function createChatHistory(formattedChat: string) {
    const chatHistory: ChatCompletionMessageParam[] = [];

    const systemMessage: ChatCompletionMessageParam = {
        role: "system",

        content: `Using the provided context, address the question being asked and make sure to provide a clear and concise answer with no follow-up statements.
        The LAST comment in 'Issue Conversation' is the most recent one, focus on it as that is the question being asked.
        Use GitHub flavoured markdown in your response making effective use of lists, code blocks and other supported GitHub md features.`
    };

    const userMessage: ChatCompletionMessageParam = {
        role: "user",
        content: formattedChat,
    };

    chatHistory.push(systemMessage, userMessage);

    return chatHistory;
}