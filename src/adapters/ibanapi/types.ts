/** IBANAPI response types (UC-212). */

export interface IbanValidation {
  result: number;
  message: string;
}

export interface IbanApiResponse {
  result: number;
  message: string;
  validations: IbanValidation[];
  data: {
    country_code: string;
    iso_alpha3: string;
    country_name: string;
    currency_code: string;
    sepa_member: string;
    sepa: Record<string, string>;
    bank_data?: {
      bank_name: string;
      bic: string;
      branch: string;
      address: string;
      city: string;
      zip: string;
      phone: string;
    };
    [key: string]: unknown;
  };
}
