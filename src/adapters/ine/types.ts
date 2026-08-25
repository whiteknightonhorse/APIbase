/** INE (Instituto Nacional de Estadística, Spain) Tempus3 API raw response types. */

/** One row of `OPERACIONES_DISPONIBLES` / `OPERACION/{code}` — a statistical operation. */
export interface IneOperation {
  Id: number;
  Cod_IOE?: string;
  Nombre: string;
  Codigo: string;
  Url?: string;
}

/** One row of `TABLAS_OPERACION/{code}` (friendly mode, tip=A) — a published table. */
export interface IneTable {
  Id: number;
  Nombre: string;
  Codigo: string;
  T3_Periodicidad?: string;
  T3_Publicacion?: string;
  T3_Periodo_ini?: string;
  Anyo_Periodo_ini?: string;
  FechaRef_fin?: string;
  Ultima_Modificacion?: string;
}

/** `SERIE/{code}` (friendly mode, tip=A, det=2) — series metadata. */
export interface IneSeriesMetadata {
  COD: string;
  Nombre: string;
  Decimales?: number;
  Operacion?: { Codigo?: string; Nombre?: string; Cod_IOE?: string };
  Periodicidad?: { Nombre?: string; Codigo?: string };
  Publicacion?: { Nombre?: string };
}

/** One observation row inside `DATOS_SERIE/{code}` (friendly mode, tip=AM). */
export interface IneDataPoint {
  Fecha: string;
  T3_TipoDato?: string;
  T3_Periodo?: string;
  Anyo?: number;
  Valor: number;
  Secreto?: boolean;
}

/** `DATOS_SERIE/{code}` (friendly mode, tip=AM) — series data response. */
export interface IneSeriesData {
  COD: string;
  Nombre: string;
  T3_Unidad?: string;
  T3_Escala?: string;
  Data: IneDataPoint[];
}
