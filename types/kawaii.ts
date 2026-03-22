// Frontend (kawaii UI) types — these are the simplified types used by the UI layer.
// API adapters in services/api.ts convert backend responses to these shapes.

export interface KawaiiActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  budget_tier: string;
  tags: string[];
  why_selected: string;
  image_url: string;
  location?: string;
  links?: { label: string; url: string }[];
  hours?: string;
  rating?: number;
}

export interface KawaiiCityItinerary {
  city: string;
  date_range: string;
  activities: KawaiiActivity[];
}

export interface KawaiiTripSuggestions {
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  cities: KawaiiCityItinerary[];
}

export interface KawaiiTransportOption {
  mode: string;
  duration: string;
  cost: string;
  notes?: string;
}

export interface KawaiiItineraryNode {
  id: string;
  type: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
  image_url: string;
  why_selected: string;
  budget_tier: string;
  tags: string[];
  links?: { label: string; url: string }[];
  transport_options?: KawaiiTransportOption[];
  is_pivot?: boolean;
}

export interface KawaiiDayPlan {
  date: string;
  label: string;
  nodes: KawaiiItineraryNode[];
}

export interface KawaiiItinerary {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget_tier: string;
  days: KawaiiDayPlan[];
}

export interface KawaiiConflict {
  id: string;
  date: string;
  time_slot: string;
  options: KawaiiActivity[];
}

export interface KawaiiFood {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  budget_tier: string;
  image_url: string;
  location: string;
  rating: number;
  tags: string[];
  why_selected: string;
  links?: { label: string; url: string }[];
}

export interface KawaiiPivotAlert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  new_nodes: KawaiiItineraryNode[];
}
