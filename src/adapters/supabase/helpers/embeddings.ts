import { SupabaseClient } from "@supabase/supabase-js";
import { Super } from "./supabase";
import { Context } from "../../../types/context";
import { VoyageAIClient } from "voyageai";
import { CommentType, EmbeddingClass, IssueSimilaritySearchResult } from "../../../types/embeddings";

const VECTOR_SIZE = 1024;

/**
 * Embeddings class for creating, updating, and deleting embeddings.
 *
 * Schema is as follows:
 * - `source_id` - The unique identifier for the embedding. (e.g. comment node_id, telegram chat_id, etc.)
 * - `type` - The type of embedding. (e.g. setup_instructions, dao_info, task, comment). Consider this the category.
 * - `plaintext` - The plaintext version of the markdown
 * - `embedding` - The embedding vector for the markdown
 * - `metadata` - Additional metadata for the embedding. (e.g. author_association, author_id, fileChunkIndex, filePath, isPrivate)
 * - `created_at` - The timestamp when the embedding was created
 * - `modified_at` - The timestamp when the embedding was last modified
 */
export class Embeddings extends Super {
  private _voyageClient: VoyageAIClient;
  constructor(voyageClient: VoyageAIClient, supabase: SupabaseClient, context: Context) {
    super(supabase, context);
    this._voyageClient = voyageClient;
  }

  async getEmbedding(sourceId: string): Promise<CommentType> {
    const { data, error } = await this.supabase.from("content").select("*").eq("source_id", sourceId).single();
    if (error && error.code !== "PGRST116") {
      this.context.logger.error("Error getting comment", { err: error, sourceId });
    }
    return data;
  }

  async getEmbeddingsByClass(embeddingClass: EmbeddingClass): Promise<CommentType[]> {
    const { data, error } = await this.supabase.from("content").select("*").eq("type", embeddingClass);
    if (error) {
      this.context.logger.error("Error getting comments", { err: error, embeddingClass });
      return [];
    }
    return data;
  }

  // Working with embeddings
  async findSimilarContent(markdown: string, threshold: number, currentId: string): Promise<IssueSimilaritySearchResult[]> {
    const embedding = await this._embedWithVoyage(markdown, "query");
    const { data, error } = await this.supabase.rpc("find_similar_content", {
      curr_source_id: currentId,
      query_embedding: embedding,
      threshold: threshold,
    });
    if (error) {
      this.context.logger.error("Error finding similar issues", error);
      return [];
    }
    return data;
  }

  /**
   * Compares a single query against all embeddings in the database and returns the most similar embeddings.
   */
  async findRelevantContext(markdown: string, threshold: number): Promise<IssueSimilaritySearchResult[]> {
    const embedding = await this._embedWithVoyage(markdown, "query");
    const { data, error } = await this.supabase.rpc("find_relevant_context", {
      query_embedding: embedding,
      threshold: threshold,
    });
    if (error) {
      this.context.logger.error("Error finding similar issues", error);
      return [];
    }
    return data;
  }

  async hybridSearchWithMetadata(
    queryEmbedding: number[],
    contentType: string,
    metadataKey?: string,
    metadataValue?: string
  ) {
    const { data, error } = await this.supabase
      .rpc('hybridsearchwithmeta', {
        query_embedding: queryEmbedding,  // The embedding vector of the query
        // content_type: contentType,        // The classified content type (e.g., "setup_instructions")
        // metadata_key: metadataKey,        // The key to filter the metadata
        // metadata_value: metadataValue     // The value to filter the metadata
      });

    if (error) {
      console.error('Error performing hybrid search:', error);
      return null;
    }

    return data;  // Results from the hybrid search
  }

  async _embedWithVoyage(text: string | null, inputType: "document" | "query"): Promise<number[]> {
    try {
      if (text === null) {
        return new Array(VECTOR_SIZE).fill(0);
      } else {
        const response = await this._voyageClient.embed({
          input: text,
          model: "voyage-large-2-instruct",
          inputType: inputType
        });
        return (response.data && response.data[0]?.embedding) || [];
      }
    } catch (err) {
      throw new Error(this.context.logger.error("Error embedding comment", { err })?.logMessage.raw);
    }
  }
}

