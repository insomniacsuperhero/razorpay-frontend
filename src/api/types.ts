export interface Session { access_token: string; token_type: string; expires_at: string; dispute_id: string | null }
export interface Requirement { field: string; label: string }
export type EvidenceStatus = 'queued' | 'extracting' | 'analysing' | 'validating' | 'uploading' | 'ready' | 'failed';
export interface EvidenceFact { key: string; label: string; value: string | number | null; display: string | number; source: string; edited: boolean; matches_payment: boolean }
export interface EvidenceCard {
  id: string; filename: string; status: EvidenceStatus; stage_index?: number | null;
  error?: { code: string; message: string } | null;
  document_type?: string | null; detected_mime_type?: string | null;
  field?: string | null; field_label?: string; suggested_field?: string | null; role?: string | null;
  verdict?: 'strong' | 'relevant' | 'needs_attention' | 'not_useful' | null; verdict_label?: string | null;
  reason?: string | null; question?: string | null; facts?: EvidenceFact[];
  mismatches?: { fact: string; found: unknown; expected: unknown; message: string }[];
  quality_issues?: string[]; readable?: boolean; merchant_confirmed?: boolean; bank_flag?: string | { reason?: string } | null;
  razorpay_document_id?: string | null; correction_count?: number; notes?: string[]; preview_url?: string | null; removed?: boolean;
}
export interface DisputeDetail {
  dispute: { id: string; status: string; phase?: string | null; respond_by?: number | null; amount: number; amount_display: string; currency?: string; reason_code: string; reason_label: string; respond_by_iso: string | null; seconds_left: number | null; deadline_passed: boolean; can_contest: boolean; bank_request: { field?: string; reason?: string } | null; evidence_on_record: Record<string, unknown> };
  payment: { id: string; amount_display: string; status: string; method: string; created_at: string | number; contact_masked?: string | null; email_masked?: string | null; order_id?: string | null; order_ref?: string | null } | null;
  payment_error?: string | null;
  payment_verified: boolean;
  requirements: { required: Requirement[]; helpful: Requirement[]; hint: string };
  evidence: EvidenceCard[];
  run: { timer_started_at: string | null; submitted_at: string | null; draft_summary: string | null; contested_amount: number | null };
}
export interface AcceptResponse { dispute: DisputeDetail['dispute'] }
export interface UploadSlot { upload_id: string; put_url: string; method: 'PUT'; headers: Record<string, string>; expires_in: number }
export interface EvidencePatch { fact_key?: string; value?: string | number | null; final_field?: string; confirm?: boolean; answer?: 'yes' | 'no'; clear_bank_flag?: boolean }
export interface CoverageItem extends Requirement { role: string; state: string; evidence_ids: string[] }
export interface Coverage {
  required: CoverageItem[]; helpful: CoverageItem[]; complete: boolean; label: string;
  needs_attention: string[]; processing: string[]; fields_with_documents: Record<string, string[]>;
  summary: { draft: string; generated: string; edited: boolean; max_length: number };
  contested_amount: number; disputed_amount: number;
}
export interface ContestResponse extends AcceptResponse { documents: number; seconds_to_submit?: number | null; sent?: Record<string, unknown> }
export interface Draft { summary: string; contested_amount: number }
