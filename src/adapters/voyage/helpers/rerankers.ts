import { VoyageAIClient } from "voyageai";
import { Context } from "../../../types";
import { SuperVoyage } from "./voyage";

export class Rerankers extends SuperVoyage {
  protected context: Context;

  constructor(client: VoyageAIClient, context: Context) {
    super(client, context);
    this.context = context;
  }

  async reRankResults(results: string[], query: string): Promise<string[]> {
    const response = await this.client.rerank({
      query,
      documents: results,
      model: "rerank-2",
      returnDocuments: true,
      topK: 5,
    });
    const rerankedResults = response.data || [];
    return rerankedResults.map((result) => result.document).filter((document): document is string => document !== undefined);
  }
}
