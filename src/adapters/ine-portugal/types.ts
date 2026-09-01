// Raw response shapes for the Statistics Portugal (INE) JSON indicator API
// (www.ine.pt/ine/json_indicador/). This is a flat, non-SDMX, indicator-code-based API — every
// endpoint returns a single-element JSON array wrapping either a success payload or an error
// payload keyed by "Sucesso.Falso". Critically, upstream ALWAYS returns HTTP 200 even for
// invalid indicator codes or invalid dimension filter codes — the error is only distinguishable
// by inspecting the body shape, so parseResponse() must detect it explicitly.

/** Error payload shape — returned with HTTP 200 for invalid varcd/DimN codes. */
export interface IneErrorEnvelope {
  Sucesso: {
    Falso: Array<{
      IndicadorCod: string;
      Lingua: string;
      DataExtracao: string;
      Msg: string;
      Cod: string;
    }>;
  };
}

/** A single observation row inside `Dados.{period}[]`. */
export interface IneDataRow {
  geocod?: string;
  geodsg?: string;
  dim_3?: string;
  dim_3_t?: string;
  dim_4?: string;
  dim_4_t?: string;
  dim_5?: string;
  dim_5_t?: string;
  dim_6?: string;
  dim_6_t?: string;
  ind_string?: string;
  valor?: string | number | null;
  [key: string]: unknown;
}

/** Success payload for `pindica.jsp?op=2` (indicator_data). */
export interface IneDataEnvelope {
  IndicadorCod: string;
  IndicadorDsg: string;
  MetaInfUrl?: string;
  DataExtracao: string;
  DataUltimoAtualizacao?: string;
  UltimoPref?: string;
  Dados: Record<string, IneDataRow[]>;
}

/** One category (valid code) for a dimension, from `Categoria_Dim`. */
export interface IneDimensionCategory {
  dim_num: string;
  cat_id?: string;
  categ_cod: string;
  categ_dsg: string;
  categ_ord?: string;
  categ_nivel?: string;
}

/** One dimension descriptor, from `Descricao_Dim`. */
export interface IneDimensionDescriptor {
  dim_num: string;
  abrv: string;
  versao?: string;
  nota_dsg?: string;
}

/** Success payload for `pindicaMeta.jsp?op=2` (indicator_metadata). */
export interface IneMetaEnvelope {
  IndicadorCod: string;
  IndicadorNome: string;
  Periodic?: string;
  PrimeiroPeriodo?: string;
  UltimoPeriodo?: string;
  UnidadeMedida?: string;
  Potencia10?: string;
  PrecisaoDecimal?: string;
  Lingua?: string;
  DataUltimaAtualizacao?: string;
  DataExtracao?: string;
  Dimensoes?: {
    Descricao_Dim?: IneDimensionDescriptor[];
    // Categoria_Dim is an array of single-key objects: { "Dim_Num1_S7A2023": [ {...} ] }
    Categoria_Dim?: Array<Record<string, IneDimensionCategory[]>>;
  };
}

export type IneDataResponse = [IneDataEnvelope] | [IneErrorEnvelope];
export type IneMetaResponse = [IneMetaEnvelope] | [IneErrorEnvelope];
