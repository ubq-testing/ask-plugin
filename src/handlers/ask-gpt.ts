import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { addCommentToIssue } from "./add-comment";
import { Context } from "../types";

export async function askGPT(context: Context, chatHistory: ChatCompletionMessageParam[]) {
    const {
        logger,
        config: {
            openAi_apiKey: openAi,
        },
    } = context;

    if (!openAi) {
        logger.error(`No OpenAI API Key provided`);
        await addCommentToIssue(context, "No OpenAI API Key detected!", true, "error"); // TOO confirm  correct style here
        return;
    }

    const openAI = new OpenAI({
        apiKey: openAi,
    });

    const res: OpenAI.Chat.Completions.ChatCompletion = await openAI.chat.completions.create({
        messages: chatHistory,
        model: "gpt-4o",
        temperature: 0,
    });

    if (!res.choices) {
        logger.error(`No response from OpenAI`);
        await addCommentToIssue(context, "No response from OpenAI", true, "error");
        return;
    }

    const answer = res.choices[0].message.content;

    const tokenUsage = {
        output: res.usage?.completion_tokens,
        input: res.usage?.prompt_tokens,
        total: res.usage?.total_tokens,
    };

    return { answer, tokenUsage };
}
