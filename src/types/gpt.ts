export type StreamlinedComment = {
  id: number;
  user?: string;
  body?: string;
  org: string;
  repo: string;
  issueUrl: string;
  specOrBody?: {
    html: string;
    text: string;
  };
};

export type StreamlinedComments = {
  issueNumber: number;
  repo: string;
  org: string;
  comments: StreamlinedComment[];
};
