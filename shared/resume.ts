export type ResumeDocument = {
  name: string;
  text: string;
  hash: string;
  loaded_at: string;
};
export type MatchEvidence = {
  skill: string;
  resume_quote: string;
  job_quote: string;
};
export type FitResult = {
  job_id: string;
  posting_hash: string;
  technical_coverage: number | null;
  matched: MatchEvidence[];
  not_evidenced: string[];
  project_evidence: string[];
  suggestions: string[];
  guard_verdict: string;
  guard_findings: unknown;
  review_required: boolean;
  agent_review: AgentReview | null;
};
export type Dimension = "technical" | "experience" | "behavioral" | "career";
export type Gate = {
  status: "pass" | "fail" | "unverified";
  evidence: string;
  explanation: string;
};
export type AgentReview = {
  job_id: string;
  resume_hash: string;
  posting_hash: string;
  dimensions: Record<
    Dimension,
    {
      score: number | null;
      resume_quote: string;
      job_quote: string;
      explanation: string;
    }
  >;
  eligibility: Gate;
  language: Gate;
  location: Gate;
  suggestions: string[];
  overall: number | null;
  reviewed_at: string;
};
export type ResumeState = {
  files: string[];
  resume: ResumeDocument | null;
  skill: {
    available: boolean;
    directory: string;
    framework_version: string | null;
    weights: Record<Dimension, number> | null;
    error: string | null;
  };
  results: FitResult[];
};
