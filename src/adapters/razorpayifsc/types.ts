/**
 * Razorpay IFSC API response types (UC-425).
 *
 * API: GET https://ifsc.razorpay.com/{IFSC_CODE}
 * Auth: None (public, MIT-licensed open data)
 */

/**
 * Bank branch details returned by the Razorpay IFSC API.
 */
export interface IfscLookupResponse {
  /** Magnetic Ink Character Recognition code (9 digits) */
  MICR: string | null;
  /** Branch name */
  BRANCH: string;
  /** Full branch address */
  ADDRESS: string;
  /** State where the branch is located */
  STATE: string;
  /** Contact phone number for the branch */
  CONTACT: string | null;
  /** Whether UPI transactions are supported */
  UPI: boolean;
  /** Whether RTGS transfers are supported */
  RTGS: boolean;
  /** City where the branch is located */
  CITY: string;
  /** Centre (RBI region/centre) */
  CENTRE: string;
  /** District where the branch is located */
  DISTRICT: string;
  /** Whether NEFT transfers are supported */
  NEFT: boolean;
  /** Whether IMPS transfers are supported */
  IMPS: boolean;
  /** SWIFT/BIC code for international transfers (null if not applicable) */
  SWIFT: string | null;
  /** ISO 3166-2 subdivision code (e.g. "IN-KA" for Karnataka) */
  ISO3166: string;
  /** Full bank name */
  BANK: string;
  /** 4-letter bank code (first 4 chars of IFSC) */
  BANKCODE: string;
  /** The 11-character IFSC code */
  IFSC: string;
}
