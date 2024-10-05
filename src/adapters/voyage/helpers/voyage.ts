import { VoyageAIClient } from "voyageai";
import { Context } from "../../../types/context";

export class SuperVoyage {
  protected client: VoyageAIClient;
  protected context: Context;

  constructor(client: VoyageAIClient, context: Context) {
    this.client = client;
    this.context = context;
  }
}
