import { SupabaseClient } from "@supabase/supabase-js";
import { SuperSupabase } from "./supabase";
import { Context } from "../../../types/context";

export interface CommentType {
  id: string;
  plaintext: string;
  markdown?: string;
  author_id: number;
  created_at: string;
  modified_at: string;
  embedding: number[];
}

export class Comment extends SuperSupabase {
  constructor(supabase: SupabaseClient, context: Context) {
    super(supabase, context);
  }
  async getComment(commentNodeId: string): Promise<CommentType[] | null> {
    const { data, error } = await this.supabase.from("issue_comments").select("*").eq("id", commentNodeId);
    if (error) {
      this.context.logger.error("Error getting comment", error);
    }
    return data;
  }

  async findSimilarComments(query: string, threshold: number, currentId: string): Promise<CommentType[] | null> {
    const embedding = await this.context.adapters.voyage.embedding.createEmbedding(query);
    const { data, error } = await this.supabase.rpc("find_similar_comments_with_vector_search_ftse", {
      current_id: currentId,
      query_embedding: embedding,
      threshold: threshold,
    });
    if (error) {
      this.context.logger.error("Error finding similar comments", error);
    }
    return data;
  }
}
