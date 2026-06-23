export interface InseePeriodeUniteLegale {
  dateFin: string | null;
  dateDebut: string | null;
  etatAdministratifUniteLegale: string | null;
  denominationUniteLegale: string | null;
  sigleUniteLegale?: string | null;
  categorieJuridiqueUniteLegale: string | null;
  activitePrincipaleUniteLegale: string | null;
  nomenclatureActivitePrincipaleUniteLegale?: string | null;
  nicSiegeUniteLegale?: string | null;
  economieSocialeSolidaireUniteLegale?: string | null;
  societeMissionUniteLegale?: string | null;
  caractereEmployeurUniteLegale?: string | null;
}

export interface InseeUniteLegale {
  siren: string;
  statutDiffusionUniteLegale?: string;
  dateCreationUniteLegale?: string | null;
  sigleUniteLegale?: string | null;
  trancheEffectifsUniteLegale?: string | null;
  anneeEffectifsUniteLegale?: string | null;
  dateDernierTraitementUniteLegale?: string | null;
  nombrePeriodesUniteLegale?: number;
  categorieEntreprise?: string | null;
  anneeCategorieEntreprise?: string | null;
  activitePrincipaleNAF25UniteLegale?: string | null;
  periodesUniteLegale?: InseePeriodeUniteLegale[];
  // Flattened fields (when returned directly from SIRET response)
  etatAdministratifUniteLegale?: string | null;
  denominationUniteLegale?: string | null;
  categorieJuridiqueUniteLegale?: string | null;
  activitePrincipaleUniteLegale?: string | null;
  nicSiegeUniteLegale?: string | null;
}

export interface InseePeriodeEtablissement {
  dateFin: string | null;
  dateDebut: string | null;
  etatAdministratifEtablissement: string | null;
  activitePrincipaleEtablissement: string | null;
  nomenclatureActivitePrincipaleEtablissement?: string | null;
  denominationUsuelleEtablissement?: string | null;
  caractereEmployeurEtablissement?: string | null;
}

export interface InseeAdresseEtablissement {
  complementAdresseEtablissement?: string | null;
  numeroVoieEtablissement?: string | null;
  typeVoieEtablissement?: string | null;
  libelleVoieEtablissement?: string | null;
  codePostalEtablissement?: string | null;
  libelleCommuneEtablissement?: string | null;
  codeCommuneEtablissement?: string | null;
  codePaysEtrangerEtablissement?: string | null;
  libellePaysEtrangerEtablissement?: string | null;
  coordonneeLambertAbscisseEtablissement?: string | null;
  coordonneeLambertOrdonneeEtablissement?: string | null;
}

export interface InseeEtablissement {
  siren: string;
  nic: string;
  siret: string;
  statutDiffusionEtablissement?: string;
  dateCreationEtablissement?: string | null;
  trancheEffectifsEtablissement?: string | null;
  anneeEffectifsEtablissement?: string | null;
  dateDernierTraitementEtablissement?: string | null;
  etablissementSiege?: boolean;
  nombrePeriodesEtablissement?: number;
  activitePrincipaleNAF25Etablissement?: string | null;
  uniteLegale?: InseeUniteLegale;
  adresseEtablissement?: InseeAdresseEtablissement;
  periodesEtablissement?: InseePeriodeEtablissement[];
}

export interface InseeSirenResponse {
  header: { statut: number; message: string };
  uniteLegale: InseeUniteLegale;
}

export interface InseeSiretResponse {
  header: { statut: number; message: string };
  etablissement: InseeEtablissement;
}

export interface InseeSirenSearchResponse {
  header: { statut: number; message: string; total?: number; debut?: number; nombre?: number };
  unitesLegales: InseeUniteLegale[];
}

export interface InseeSiretSearchResponse {
  header: { statut: number; message: string; total?: number; debut?: number; nombre?: number };
  etablissements: InseeEtablissement[];
}

export interface InseeCompanyOutput {
  siren: string;
  name: string | null;
  acronym: string | null;
  status: string | null;
  naf_code: string | null;
  legal_category: string | null;
  creation_date: string | null;
  company_size: string | null;
  last_updated: string | null;
  head_office_nic: string | null;
}

export interface InseeEstablishmentOutput {
  siret: string;
  siren: string;
  nic: string;
  is_head_office: boolean;
  status: string | null;
  naf_code: string | null;
  creation_date: string | null;
  address: {
    street: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
  };
  company: InseeCompanyOutput | null;
}
