/** INE Spain (Instituto Nacional de Estadística) Tempus3 API raw response types (UC-663). */

/** One row from GET /OPERACIONES_DISPONIBLES — a published statistical operation. */
export interface IneOperacion {
  Id: number;
  Cod_IOE: string;
  Nombre: string;
  Codigo: string;
  Url?: string;
}

/** One row from GET /TABLAS_OPERACION/{operation} — a published table within an operation. */
export interface IneTabla {
  Id: number;
  Nombre: string;
  Codigo?: string;
  FK_Periodicidad?: number;
  FK_Publicacion?: number;
  FK_Periodo_ini?: number;
  Anyo_Periodo_ini?: string;
  FK_Periodo_fin?: number;
  Anyo_Periodo_fin?: string;
  FechaRef_fin?: string;
  Ultima_Modificacion?: number;
}

/** One data point in the compact (det=0/1) DATOS_SERIE / DATOS_TABLA shape. */
export interface IneDatoCompacto {
  Fecha: number;
  FK_TipoDato: number;
  FK_Periodo: number;
  Anyo: number;
  Valor: number | null;
  Secreto: boolean;
}

/** One data point in the rich (det=2) DATOS_SERIE shape. */
export interface IneDatoDetallado {
  Fecha: number;
  TipoDato: { Id: number; Nombre: string; Codigo: string };
  Periodo: {
    Id: number;
    Valor: number;
    FK_Periodicidad: number;
    Codigo: string;
    Nombre: string;
    Nombre_largo: string;
  };
  Anyo: number;
  NombrePeriodo: string;
  CodigoPeriodo: string;
  Valor: number | null;
  Secreto: boolean;
}

/** GET /DATOS_SERIE/{codigo} response (one series, with its data points). */
export interface IneSerieDatos {
  COD: string;
  Nombre: string;
  FK_Unidad?: number;
  Unidad?: { Id: number; Nombre: string; Abrev?: string | null };
  FK_Escala?: number;
  Escala?: { Id: number; Nombre: string; Factor?: string };
  Data: (IneDatoCompacto | IneDatoDetallado)[];
}

/** GET /DATOS_TABLA/{id} response (array of series, each with its data points). */
export type IneTablaDatos = IneSerieDatos[];
