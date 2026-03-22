export interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  budget_tier: 'free' | 'moderate' | 'premium';
  tags: string[];
  why_selected: string;
  image_url: string;
  location?: string;
  links?: { label: string; url: string }[];
  hours?: string;
  rating?: number;
}

export interface CityItinerary {
  city: string;
  date_range: string;
  activities: Activity[];
}

export interface TripSuggestions {
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  cities: CityItinerary[];
}

export interface ItineraryNode {
  id: string;
  type: 'activity' | 'meal' | 'transport' | 'hotel' | 'event';
  title: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
  image_url: string;
  why_selected: string;
  budget_tier: 'free' | 'moderate' | 'premium';
  tags: string[];
  links?: { label: string; url: string }[];
  transport_options?: TransportOption[];
  is_pivot?: boolean;
}

export interface TransportOption {
  mode: string;
  duration: string;
  cost: string;
  notes?: string;
}

export interface DayPlan {
  date: string;
  label: string;
  nodes: ItineraryNode[];
}

export interface Itinerary {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget_tier: string;
  days: DayPlan[];
}

export interface Conflict {
  id: string;
  date: string;
  time_slot: string;
  options: Activity[];
}

export interface FoodSuggestion {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  budget_tier: 'free' | 'moderate' | 'premium';
  image_url: string;
  location: string;
  rating: number;
  tags: string[];
  why_selected: string;
  links?: { label: string; url: string }[];
}

export interface PivotAlert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  new_nodes: ItineraryNode[];
}
