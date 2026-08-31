/** GeoDIVA (Alaska Volcano Observatory) API raw response types (UC-644). */

export interface GeoDivaVolcano {
  VolcanoId: string;
  Vnum: number;
  Volcano: string;
  OfficialName: string;
  ParentVolcanoId: string;
  ParentVolcano: string;
  AgeClass: string | null;
  AgeSource?: string | null;
  Composition?: string | null;
  IsMonitored: boolean;
  VolcanoType: string | null;
  NvewsThreat: string | null;
  Description?: string | null;
  NameOrigin?: string | null;
}

export interface GeoDivaEruption {
  ID: number;
  Name: string;
  Description?: string | null;
  StartYear?: number | null;
  StartMonth?: number | null;
  StartDay?: number | null;
  StartTime?: string | null;
  StartQualifier?: string | null;
  StartQualifierUnit?: string | null;
  EndYear?: number | null;
  EndMonth?: number | null;
  EndDay?: number | null;
  EndTime?: string | null;
  EndQualifier?: string | null;
  EndQualifierUnit?: string | null;
  Volcano: string;
  ParentVolcano: string;
  VolcanoID: string;
  ParentVolcanoID: string;
}
