/** IMF DataMapper API raw response shape (UC-434). */
export interface ImfDataMapperResponse {
  values: Record<string, Record<string, Record<string, number>>>;
}
