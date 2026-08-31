// Raw response shapes for the Launch Library 2 API (ll.thespacedevs.com/2.3.0), run by
// The Space Devs. Free anonymous tier — responses are large nested DRF objects; only the
// fields APIbase actually surfaces are typed. `launch_detail` passes the full upstream object
// through untyped since its shape has dozens of nested sub-objects (image, program, pad,
// mission, rocket configuration, etc.) that vary per launch.

export interface LaunchLibraryPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface LaunchLibraryLaunchSummary {
  id: string;
  name: string;
  slug: string;
  status: { id: number; name: string; abbrev: string; description?: string };
  net: string | null;
  window_start: string | null;
  window_end: string | null;
  probability: number | null;
  launch_service_provider: { id: number; name: string; abbrev: string } | null;
  rocket: { configuration?: { id: number; name: string; full_name?: string } } | null;
  mission: { id: number; name: string; description?: string; orbit?: { name: string } } | null;
  pad: {
    id: number;
    name: string;
    location?: { id: number; name: string; country_code?: string };
  } | null;
  webcast_live: boolean;
}

export type LaunchLibraryLaunchDetail = Record<string, unknown>;

export interface LaunchLibraryAgencySummary {
  id: number;
  name: string;
  abbrev: string;
  type: { id: number; name: string } | null;
  country: Array<{ name: string; alpha_3_code: string }>;
  founding_year: string | null;
  description: string | null;
}

export interface LaunchLibraryAstronautSummary {
  id: number;
  name: string;
  status: { id: number; name: string };
  agency: { id: number; name: string; abbrev: string } | null;
}
