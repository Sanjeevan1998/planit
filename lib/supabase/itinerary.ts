import type { Itinerary, ItineraryNode } from "@/types";
import { createAdminClient } from "./admin";

// ============================================================
// Itinerary CRUD helpers
// ============================================================

export async function createItinerary(
  userId: string,
  data: Partial<Itinerary>
): Promise<Itinerary | null> {
  const supabase = createAdminClient();

  const { data: itinerary, error } = await supabase
    .from("itineraries")
    .insert({
      user_id: userId,
      title: data.title || "My Trip",
      destination: data.destination || "Tokyo",
      start_date: data.start_date || new Date().toISOString().split("T")[0],
      end_date: data.end_date || new Date().toISOString().split("T")[0],
      budget_tier: data.budget_tier || "mid-range",
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("[Itinerary] Create error:", error);
    return null;
  }

  return itinerary as Itinerary;
}

export async function getActiveItinerary(userId: string): Promise<Itinerary | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("itineraries")
    .select(`
      *,
      nodes:itinerary_nodes(*)
    `)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as Itinerary;
}

export async function getItinerary(itineraryId: string): Promise<Itinerary | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("itineraries")
    .select(`
      *,
      nodes:itinerary_nodes(*)
    `)
    .eq("id", itineraryId)
    .single();

  if (error) return null;

  // Sort nodes so branches are grouped
  if (data.nodes) {
    data.nodes.sort((a: ItineraryNode, b: ItineraryNode) => {
      const timeA = new Date(a.start_time || 0).getTime();
      const timeB = new Date(b.start_time || 0).getTime();
      return timeA - timeB;
    });
  }

  return data as Itinerary;
}

export async function saveNodes(
  itineraryId: string,
  nodes: Partial<ItineraryNode>[]
): Promise<ItineraryNode[]> {
  const supabase = createAdminClient();

  const inserts = nodes.map((n) => ({
    itinerary_id: itineraryId,
    parent_id: n.parent_id || null,
    branch_label: n.branch_label || "A",
    type: n.type || "activity",
    title: n.title || "Untitled",
    description: n.description || "",
    lat: n.location?.lat || 0,
    lng: n.location?.lng || 0,
    address: n.location?.address || "",
    place_id: n.location?.place_id || null,
    start_time: n.start_time || null,
    end_time: n.end_time || null,
    duration_minutes: n.duration_minutes || 60,
    budget_tier: n.budget_tier || "mid-range",
    budget_estimate: n.budget_estimate || null,
    accessibility_verified: n.accessibility_verified || false,
    accessibility_notes: n.accessibility_notes || null,
    why_selected: n.why_selected || "",
    tags: n.tags || [],
    atmosphere: n.atmosphere || [],
    booking_links: JSON.stringify(n.booking_links || []),
    transport_options: JSON.stringify(n.transport_options || []),
    is_active: n.is_active ?? true,
    is_pivot: n.is_pivot ?? false,
    metadata: JSON.stringify(n.metadata || {}),
  }));

  const { data, error } = await supabase
    .from("itinerary_nodes")
    .insert(inserts)
    .select();

  if (error) {
    console.error("[Itinerary] Save nodes error:", error);
    return [];
  }

  return data as ItineraryNode[];
}

export async function setActiveNode(
  itineraryId: string,
  nodeId: string
): Promise<void> {
  const supabase = createAdminClient();

  // Deactivate all nodes in itinerary first
  await supabase
    .from("itinerary_nodes")
    .update({ is_active: false })
    .eq("itinerary_id", itineraryId);

  // Activate the selected node
  await supabase
    .from("itinerary_nodes")
    .update({ is_active: true })
    .eq("id", nodeId);
}

export async function pivotItinerary(
  itineraryId: string,
  reason: string,
  newNodes: Partial<ItineraryNode>[]
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from("itineraries")
    .update({
      status: "pivoted",
      pivot_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itineraryId);

  if (newNodes.length > 0) {
    await saveNodes(itineraryId, newNodes.map((n) => ({ ...n, is_pivot: true })));
  }
}
