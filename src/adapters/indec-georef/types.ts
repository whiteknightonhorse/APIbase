// Raw response shapes for the INDEC Georef API (apis.datos.gob.ar/georef/api).
// Only the fields actually consumed by the adapter are typed.

export interface GeorefCentroide {
  lat: number;
  lon: number;
}

export interface GeorefRef {
  id: string;
  nombre: string;
}

export interface GeorefProvincia {
  id: string;
  nombre: string;
  centroide?: GeorefCentroide;
}

export interface GeorefProvinciasResponse {
  cantidad: number;
  total: number;
  inicio: number;
  provincias: GeorefProvincia[];
}

export interface GeorefDepartamento {
  id: string;
  nombre: string;
  centroide?: GeorefCentroide;
  provincia: GeorefRef;
}

export interface GeorefDepartamentosResponse {
  cantidad: number;
  total: number;
  inicio: number;
  departamentos: GeorefDepartamento[];
}

export interface GeorefLocalidad {
  id: string;
  nombre: string;
  categoria?: string;
  centroide?: GeorefCentroide;
  provincia: GeorefRef;
  departamento?: GeorefRef;
  municipio?: GeorefRef;
}

export interface GeorefLocalidadesResponse {
  cantidad: number;
  total: number;
  inicio: number;
  localidades: GeorefLocalidad[];
}

export interface GeorefDireccion {
  nomenclatura: string;
  altura?: { valor: number | null; unidad: string | null };
  calle: { id: string | null; nombre: string | null; categoria: string | null };
  provincia: GeorefRef;
  departamento?: GeorefRef;
  localidad_censal?: GeorefRef;
  ubicacion: GeorefCentroide;
}

export interface GeorefDireccionesResponse {
  cantidad: number;
  total: number;
  inicio: number;
  direcciones: GeorefDireccion[];
}

export interface GeorefUbicacionResponse {
  ubicacion: {
    lat: number;
    lon: number;
    provincia?: GeorefRef;
    departamento?: GeorefRef;
    municipio?: GeorefRef;
  };
}
