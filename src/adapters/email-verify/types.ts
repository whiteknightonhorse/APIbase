// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

export interface EmailVerifyOutput {
  email: string;
  format_valid: boolean;
  smtp_check: boolean;
  dns_check: boolean;
  free_provider: boolean;
  disposable: boolean;
  catch_all: boolean;
  role_account: boolean;
  audit_created: string;
  audit_updated: string;
}
