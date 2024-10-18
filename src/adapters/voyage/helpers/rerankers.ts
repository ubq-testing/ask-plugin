import { VoyageAIClient } from "voyageai";
import { Context } from "../../../types";
import { SuperVoyage } from "./voyage";

export class Rerankers extends SuperVoyage {
  protected context: Context;

  constructor(client: VoyageAIClient, context: Context) {
    super(client, context);
    this.context = context;
  }

  async reRankResults(results: string[], query: string, topK: number = 5): Promise<string[]> {
    let response;
    try {
      response = await this.client.rerank({
        query,
        documents: results,
        model: "rerank-2",
        returnDocuments: true,
        topK,
      });
    } catch (e: unknown) {
      this.context.logger.error("Reranking failed!", { e });
      return results;
    }
    const rerankedResults = response.data || [];
    return rerankedResults.map((result) => result.document).filter((document): document is string => document !== undefined);
  }
}
