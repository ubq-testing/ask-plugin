export type StreamlinedComment = {
  user?: string;
  body?: string;
  id: number;
};

export type StreamlinedComments = {
  issue: number;
  repo: string;
  org: string;
  comments: StreamlinedComment[];
};
