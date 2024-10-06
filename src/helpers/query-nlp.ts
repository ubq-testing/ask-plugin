import OpenAI from "openai";
import { Context } from "../types";
import { EmbeddingClass, CommentType } from "../types/embeddings";
import { createAdapters } from "../adapters";
import { createClient } from "@supabase/supabase-js";
import { VoyageAIClient } from "voyageai";
/**
 * Prior to using the query embedding to find related content,
 * we first must NLP the query to categorize it into one of the
 * "EmbeddingClass" types. "setup_instructions" | "dao_info" | "task" | "comment".
 * 
 * This allows us to narrow the scope to only the section of information that we know
 * is relevant to the user's query. we can use the entire embedding bank but
 * refining the search to a specific class of embeddings will yield better results.
 */


export async function queryNlp(context: Context, query: string) {
    const { logger, adapters: { supabase } } = context;

    const classification = await zeroShotNlpClassify(context, query);
    const queryEmbedding = await supabase.embeddings._embedWithVoyage(query, "query");

    logger.info(`Classification of query`, { classification });
    const embeddings = await supabase.embeddings.hybridSearchWithMetadata(queryEmbedding, classification);
    console.log(`Found ${embeddings.length} embeddings for query`, { query, classification });

    console.log("Embeddings", embeddings);
    return embeddings;
}

export async function zeroShotNlpClassify(context: Context, query: string) {
    const {
        env: { OPENAI_API_KEY },
        config: { openAiBaseUrl },
    } = context;

    const openAi = new OpenAI({
        apiKey: OPENAI_API_KEY,
        ...(openAiBaseUrl && { baseURL: openAiBaseUrl }),
    });


    const sysMsg = `You are developer onboarding assistant, built by Ubiquity DAO and your name is UbiquityOS.
      You are designed to help developers onboard to the Ubiquity DAO ecosystem, all queries will pertain to the Ubiquity DAO ecosystem.
      You will classify a query and from that classification, we are able to fetch a category of embeddings to use as context for the query.

      There are four classifications of user query:

      - setup_instructions: This relates directly to questions which seek to understand how to set up a project.
        e.g: "How do I setup the kernel?" "How do I start a plugin?"
      - dao_info: This relates to questions which seek to understand the Ubiquity DAO ecosystem.
        e.g: "What is the Ubiquity DAO?" "What is the Ubiquity DAO mission?"
      - task: Tasks are issue specifications, they cover features, bugs, and other tasks that need to be completed.
        e.g: "What is issue xyz about?" "How do I fix issue xyz?"
      - comment: Comments are user comments on issues, they can be used to provide context to a query.
        e.g: "What are the comments on issue xyz?" "What do people think about issue xyz?"

      Reply with a one-word classification of the query.
      `

    const res: OpenAI.Chat.Completions.ChatCompletion = await openAi.chat.completions.create({
        messages: [
            {
                role: "system",
                content: sysMsg,
            },
            {
                role: "user",
                content: query,
            },
        ],
        model: "chatgpt-4o-latest",
    });

    return res.choices[0].message.content as EmbeddingClass;
}