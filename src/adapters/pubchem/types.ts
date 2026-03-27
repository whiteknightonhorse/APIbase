/**
 * PubChem PUG REST API response types (UC-213).
 */

/** Property table response from /compound/{id}/property/... */
export interface PubchemPropertyResponse {
  PropertyTable: {
    Properties: Array<{
      CID: number;
      MolecularFormula?: string;
      MolecularWeight?: string;
      IUPACName?: string;
      IsomericSMILES?: string;
      CanonicalSMILES?: string;
      InChI?: string;
      InChIKey?: string;
      XLogP?: number;
      HBondDonorCount?: number;
      HBondAcceptorCount?: number;
      RotatableBondCount?: number;
      ExactMass?: string;
      MonoisotopicMass?: string;
      TPSA?: number;
      Complexity?: number;
      Charge?: number;
      HeavyAtomCount?: number;
      AtomStereoCount?: number;
      BondStereoCount?: number;
      CovalentUnitCount?: number;
    }>;
  };
}

/** Synonyms list response */
export interface PubchemSynonymsResponse {
  InformationList: {
    Information: Array<{
      CID: number;
      Synonym: string[];
    }>;
  };
}

/** CID list response from search endpoints */
export interface PubchemCidListResponse {
  IdentifierList: {
    CID: number[];
  };
}

/** PUG View data response (for hazard data) */
export interface PubchemPugViewResponse {
  Record: {
    RecordType: string;
    RecordNumber: number;
    RecordTitle: string;
    Section?: Array<{
      TOCHeading: string;
      Description?: string;
      Section?: Array<{
        TOCHeading: string;
        Information?: Array<{
          Name: string;
          Value: {
            StringWithMarkup?: Array<{ String: string }>;
          };
        }>;
      }>;
    }>;
  };
}

/** Autocomplete response from /autocomplete */
export interface PubchemAutocompleteResponse {
  dictionary_terms: {
    compound: string[];
  };
}
