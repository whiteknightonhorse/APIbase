/**
 * Telnyx API v2 raw response types (UC-395).
 * https://developers.telnyx.com/api
 */

export interface TelnyxBalance {
  data: {
    available_credit: string;
    balance: string;
    frozen: string;
    currency: string;
    pending: string;
    credit_limit: string;
    record_type: 'balance';
  };
}

export interface TelnyxMessageData {
  id: string;
  record_type: 'message';
  direction: 'inbound' | 'outbound';
  type: 'SMS' | 'MMS';
  messaging_profile_id: string | null;
  from: { phone_number: string; carrier?: string; line_type?: string };
  to: Array<{ phone_number: string; status: string; carrier?: string; line_type?: string }>;
  text: string;
  sent_at: string | null;
  received_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  parts: number;
  cost?: { amount: string; currency: string };
  errors: Array<{ code: string; title: string; detail: string }>;
}

export interface TelnyxMessageEnvelope {
  data: TelnyxMessageData;
}

export interface TelnyxMessageList {
  data: TelnyxMessageData[];
  meta: { total_pages: number; total_results: number; page_number: number; page_size: number };
}
