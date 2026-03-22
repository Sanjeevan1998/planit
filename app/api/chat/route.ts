import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPlanitEngine } from "@/lib/langgraph/graph";
import { getAllMemories, storeBatchMemories, updateProfileVector } from "@/lib/supabase/memory";
import { getActiveItinerary } from "@/lib/supabase/itinerary";
import { logger } from "@/lib/logger";
import type { ChatRequest, ChatResponse, UserMemory } from "@/types";

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body: ChatRequest = await req.json();
    const { message, user_id, itinerary_id, location, voice_mode } = body;

    if (!message || !user_id) {
      return NextResponse.json({ error: "message and user_id are required" }, { status: 400 });
    }

    logger.info("Chat API", `← "${message}" (user: ${user_id})`);

    const supabase = createAdminClient();

    const [{ data: userProfile }, { data: accessPrefs }] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user_id).single(),
      supabase.from("accessibility_preferences").select("*").eq("user_id", user_id).single(),
    ]);

    const memories = await getAllMemories(user_id);
    logger.debug("Chat API", `Loaded ${memories.length} memories for user`);

    let itinerary = null;
    if (itinerary_id) {
      const { data } = await supabase
        .from("itineraries")
        .select("*, nodes:itinerary_nodes(*)")
        .eq("id", itinerary_id)
        .single();
      itinerary = data;
    } else {
      itinerary = await getActiveItinerary(user_id);
    }
    logger.debug("Chat API", `Active itinerary: ${itinerary?.id ?? "none"}`);

    // Run the PlanitEngine
    const engineState = await runPlanitEngine({
      user_id,
      user_profile: userProfile || undefined,
      accessibility_prefs: accessPrefs || undefined,
      user_memories: memories,
      current_location: location,
      current_time: new Date().toISOString(),
      itinerary: itinerary || undefined,
      user_input: voice_mode ? undefined : message,
      voice_transcript: voice_mode ? message : undefined,
      requires_pivot: false,
      messages: [],
    });

    logger.success("Chat API", `Engine done in ${Date.now() - t0}ms — intent: ${engineState.intent}`);
    logger.info("Chat API", `→ Response: "${engineState.response?.slice(0, 120)}"`);

    // Persist memory updates
    if (engineState.memory_updates?.length) {
      const validMemories = engineState.memory_updates.filter(
        (m): m is Required<Pick<UserMemory, "category" | "key" | "value">> & Partial<UserMemory> =>
          !!(m.category && m.key && m.value)
      );
      if (validMemories.length > 0) {
        logger.info("Chat API", `Saving ${validMemories.length} memory updates`);
        await storeBatchMemories(user_id, validMemories);
        updateProfileVector(user_id).catch(console.error);
      }
    }

    // Persist itinerary updates
    const itineraryUpdate = engineState.itinerary_update as Record<string, unknown> | undefined;
    if (itineraryUpdate && Object.keys(itineraryUpdate).length > 0) {
      const nodeCount = (itineraryUpdate.nodes as unknown[] | undefined)?.length ?? 0;
      logger.info("Chat API", `Persisting itinerary update — ${nodeCount} nodes`);

      // Helper: map AI node objects to DB columns, remapping string IDs to UUIDs
      function mapNodesForDB(rawNodes: unknown[], itineraryId: string) {
        // Build a map from AI string IDs (e.g. "node_1") to real UUIDs
        const idMap = new Map<string, string>();
        for (const n of rawNodes) {
          const node = n as Record<string, unknown>;
          if (typeof node.id === "string") {
            idMap.set(node.id, crypto.randomUUID());
          }
        }
        const validNodeTypes = new Set(["activity", "meal", "transport", "accommodation", "event", "rest", "pivot"]);
        const validBudgetTiers = new Set(["budget", "mid-range", "premium", "luxury"]);

        return rawNodes.map((n) => {
          const { id, parent_id, location, booking_links, transport_options, ...rest } = n as Record<string, unknown>;
          const loc = location as Record<string, unknown> | undefined;
          return {
            itinerary_id: itineraryId,
            id: idMap.get(id as string) ?? crypto.randomUUID(),
            parent_id: parent_id ? (idMap.get(parent_id as string) ?? null) : null,
            lat: loc?.lat ?? rest.lat ?? 0,
            lng: loc?.lng ?? rest.lng ?? 0,
            address: loc?.address ?? rest.address ?? "",
            booking_links: JSON.stringify(booking_links ?? []),
            transport_options: JSON.stringify(transport_options ?? []),
            ...rest,
            // Normalize enum fields to valid DB constraint values
            type: validNodeTypes.has(rest.type as string) ? rest.type : "activity",
            budget_tier: validBudgetTiers.has(rest.budget_tier as string) ? rest.budget_tier : "mid-range",
          };
        });
      }

      if (itinerary?.id) {
        const { nodes: newNodes, ...itineraryMeta } = itineraryUpdate;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("itineraries")
          .update({ ...itineraryMeta, updated_at: new Date().toISOString() })
          .eq("id", itinerary.id);

        // Replace nodes: delete old ones, insert new
        const nodeArr = newNodes as unknown[] | undefined;
        if (nodeArr?.length) {
          await supabase.from("itinerary_nodes").delete().eq("itinerary_id", itinerary.id);
          const { error: nodesErr } = await supabase.from("itinerary_nodes").insert(
            mapNodesForDB(nodeArr, itinerary.id!)
          );
          if (nodesErr) logger.error("Chat API", "Failed to update nodes", nodesErr);
          else logger.success("Chat API", `Updated ${nodeArr.length} itinerary nodes`);
        }
      } else {
        const { data: newItinerary, error: insertErr } = await supabase
          .from("itineraries")
          .insert({
            user_id,
            title: (itineraryUpdate.title as string) || "My Trip",
            destination: (itineraryUpdate.destination as string) || "Tokyo",
            start_date: new Date().toISOString().split("T")[0],
            end_date: new Date().toISOString().split("T")[0],
            budget_tier: (itineraryUpdate.budget_tier as string) || "mid-range",
            status: "active",
          })
          .select()
          .single();

        if (insertErr) {
          logger.error("Chat API", "Failed to insert itinerary", insertErr);
        } else {
          logger.success("Chat API", `Created itinerary ${newItinerary?.id}`);
        }

        const nodes = itineraryUpdate.nodes as unknown[] | undefined;
        if (newItinerary && nodes?.length) {
          const { error: nodesErr } = await supabase.from("itinerary_nodes").insert(
            mapNodesForDB(nodes, newItinerary.id)
          );
          if (nodesErr) logger.error("Chat API", "Failed to insert nodes", nodesErr);
          else logger.success("Chat API", `Inserted ${nodes.length} itinerary nodes`);
        }
      }
    }

    const response: ChatResponse = {
      response: engineState.response || "I'm here to help! What would you like to do?",
      itinerary_update: itineraryUpdate as ChatResponse["itinerary_update"],
      new_nodes: engineState.new_nodes?.length ? engineState.new_nodes : undefined,
      memory_updates: engineState.memory_updates?.length ? engineState.memory_updates : undefined,
      transport_options: engineState.transport_options?.length ? engineState.transport_options : undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Chat API", `Failed after ${Date.now() - t0}ms`, (error as Error).message);
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
