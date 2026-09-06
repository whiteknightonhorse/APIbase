/**
 * ORCID Public API v3.0 raw response types (UC-740).
 * https://pub.orcid.org/v3.0 — no auth, no key, public researcher registry.
 * Only the fields the adapter actually reads are typed.
 */

// ---------------------------------------------------------------------------
// GET /expanded-search
// ---------------------------------------------------------------------------

export interface OrcidExpandedSearchResultItem {
  'orcid-id': string;
  'given-names': string | null;
  'family-names': string | null;
  'credit-name': string | null;
  'other-name'?: string[] | null;
  email?: string[] | null;
  'institution-name'?: string[] | null;
}

export interface OrcidExpandedSearchResponse {
  'expanded-result': OrcidExpandedSearchResultItem[] | null;
  'num-found': number;
}

// ---------------------------------------------------------------------------
// GET /{orcid}/person
// ---------------------------------------------------------------------------

interface OrcidValueWrapper {
  value: string;
}

interface OrcidContentItem {
  content: string | null;
  visibility?: string;
}

export interface OrcidPersonResponse {
  name: {
    'given-names': OrcidValueWrapper | null;
    'family-name': OrcidValueWrapper | null;
    'credit-name': OrcidValueWrapper | null;
  } | null;
  'other-names': { 'other-name': OrcidContentItem[] | null } | null;
  biography: { content: string | null } | null;
  keywords: { keyword: OrcidContentItem[] | null } | null;
  'researcher-urls': {
    'researcher-url': { 'url-name': string | null; url: OrcidValueWrapper | null }[] | null;
  } | null;
  'external-identifiers': {
    'external-identifier':
      | {
          'external-id-type': string;
          'external-id-value': string;
          'external-id-url': OrcidValueWrapper | null;
        }[]
      | null;
  } | null;
  addresses: { address: { country: { value: string } | null }[] | null } | null;
  path: string;
}

// ---------------------------------------------------------------------------
// GET /{orcid}/works
// ---------------------------------------------------------------------------

interface OrcidExternalId {
  'external-id-type': string;
  'external-id-value': string;
}

export interface OrcidWorkSummary {
  'put-code': number;
  title: { title: OrcidValueWrapper | null } | null;
  type: string | null;
  'journal-title': OrcidValueWrapper | null;
  'publication-date': {
    year: OrcidValueWrapper | null;
    month: OrcidValueWrapper | null;
    day: OrcidValueWrapper | null;
  } | null;
  'external-ids': { 'external-id': OrcidExternalId[] | null } | null;
}

export interface OrcidWorksGroup {
  'work-summary': OrcidWorkSummary[] | null;
}

export interface OrcidWorksResponse {
  group: OrcidWorksGroup[] | null;
}
