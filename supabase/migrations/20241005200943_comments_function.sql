CREATE OR REPLACE FUNCTION find_similar_issue_ftse(
    current_id VARCHAR,
    query_text TEXT,
    query_embedding VECTOR(1024),
    threshold DOUBLE PRECISION,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    issue_id VARCHAR,
    issue_plaintext TEXT,
    similarity DOUBLE PRECISION,
    text_similarity DOUBLE PRECISION
) AS $$
DECLARE
    query_tokens TEXT[];
    query_tsquery TSQUERY;
BEGIN
    -- Generate query tokens
    SELECT array_agg(DISTINCT lower(word))
    INTO query_tokens
    FROM unnest(regexp_split_to_array(query_text, '\s+')) AS word
    WHERE length(word) > 2;

    -- Create tsquery from tokens
    SELECT to_tsquery(string_agg(lexeme || ':*', ' | '))
    INTO query_tsquery
    FROM unnest(query_tokens) lexeme;

    RETURN QUERY
    WITH vector_similarity AS (
        SELECT
            id,
            plaintext,
            (1 - (embedding <-> query_embedding))::DOUBLE PRECISION AS vec_similarity
        FROM issues
        WHERE id <> current_id
          AND (1 - (embedding <-> query_embedding))::DOUBLE PRECISION > threshold
    ),
    text_similarity AS (
        SELECT
            id,
            plaintext,
            ts_rank(to_tsvector('english', plaintext), query_tsquery)::DOUBLE PRECISION AS text_sim
        FROM issues
        WHERE to_tsvector('english', plaintext) @@ query_tsquery
    )
    SELECT
        vs.id AS issue_id,
        vs.plaintext AS issue_plaintext,
        vs.vec_similarity AS similarity,
        COALESCE(ts.text_sim, 0::DOUBLE PRECISION) AS text_similarity
    FROM vector_similarity vs
    LEFT JOIN text_similarity ts ON vs.id = ts.id
    ORDER BY (vs.vec_similarity + COALESCE(ts.text_sim, 0::DOUBLE PRECISION)) DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_comments(
    current_id VARCHAR,
    query_text TEXT,
    query_embedding VECTOR(1024),
    threshold DOUBLE PRECISION,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    comment_id VARCHAR,
    comment_plaintext TEXT,
    comment_issue_id VARCHAR,
    similarity DOUBLE PRECISION,
    text_similarity DOUBLE PRECISION
) AS $$
DECLARE
    query_tokens TEXT[];
    query_tsquery TSQUERY;
BEGIN
    -- Generate query tokens
    SELECT array_agg(DISTINCT lower(word))
    INTO query_tokens
    FROM unnest(regexp_split_to_array(query_text, '\s+')) AS word
    WHERE length(word) > 2;

    -- Create tsquery from tokens
    SELECT to_tsquery(string_agg(lexeme || ':*', ' | '))
    INTO query_tsquery
    FROM unnest(query_tokens) lexeme;

    RETURN QUERY
    WITH vector_similarity AS (
        SELECT
            id,
            plaintext,
            issue_id,
            1 - (l2_distance(query_embedding, embedding))::DOUBLE PRECISION AS vec_similarity
        FROM issue_comments
        WHERE id <> current_id
          AND 1 - (l2_distance(query_embedding, embedding))::DOUBLE PRECISION > threshold
    ),
    text_similarity AS (
        SELECT
            id,
            plaintext,
            issue_id,
            ts_rank(to_tsvector('english', plaintext), query_tsquery)::DOUBLE PRECISION AS text_sim
        FROM issue_comments
        WHERE to_tsvector('english', plaintext) @@ query_tsquery
    )
    SELECT
        vs.id AS comment_id,
        vs.plaintext AS comment_plaintext,
        vs.issue_id AS comment_issue_id,
        vs.vec_similarity AS similarity,
        COALESCE(ts.text_sim, 0::DOUBLE PRECISION) AS text_similarity
    FROM vector_similarity vs
    LEFT JOIN text_similarity ts ON vs.id = ts.id
    ORDER BY (vs.vec_similarity + COALESCE(ts.text_sim, 0::DOUBLE PRECISION)) DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;