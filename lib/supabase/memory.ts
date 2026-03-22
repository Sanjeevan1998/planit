import { GoogleGenerativeAI } from "@google/generative-ai";
import type { UserMemory, MemoryCategory } from "@/types";
import { createAdminClient } from "./admin";

// ============================================================
// Memory Layer — The "Heart" of Planit
// Handles semantic storage and retrieval of user memories
// using pgvector for similarity search.
// ============================================================

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

// Generate embedding for a text string using Gemini embedding model
// gemini-embedding-001 default dim is 3072; we cap at 1536 to match the DB schema
async function generateEmbedding(text: string): Promise<number[]> {
  const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }], role: "user" },
    // @ts-expect-error — outputDimensionality is supported but not yet in type defs
    outputDimensionality: 1536,
  });
  return result.embedding.values;
}

// ============================================================
// Store a memory with its embedding
// ============================================================
export async function storeMemory(
  userId: string,
  memory: {
    category: MemoryCategory;
    key: string;
    value: string;
    source?: UserMemory["source"];
    confidence?: number;
  }
): Promise<UserMemory | null> {
  const supabase = createAdminClient();

  const embeddingText = `${memory.key}: ${memory.value}`;
  const embedding = await generateEmbedding(embeddingText);

  // Delete-then-insert to avoid needing a named unique constraint
  await supabase.from("user_memories").delete().eq("user_id", userId).eq("key", memory.key);

  const { data, error } = await supabase
    .from("user_memories")
    .insert({
      user_id: userId,
      category: memory.category,
      key: memory.key,
      value: memory.value,
      embedding: JSON.stringify(embedding),
      source: memory.source || "text",
      confidence: memory.confidence ?? 1.0,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[Memory] Store error:", error);
    return null;
  }

  return data as UserMemory;
}

// ============================================================
// Store multiple memories at once (from onboarding/feedback)
// ============================================================
export async function storeBatchMemories(
  userId: string,
  memories: Array<{
    category: MemoryCategory;
    key: string;
    value: string;
    source?: UserMemory["source"];
    confidence?: number;
  }>
): Promise<void> {
  await Promise.all(memories.map((m) => storeMemory(userId, m)));
}

// ============================================================
// Semantic search: find memories relevant to a query
// ============================================================
export async function searchMemories(
  userId: string,
  query: string,
  limit = 10,
  threshold = 0.6
): Promise<UserMemory[]> {
  const supabase = createAdminClient();

  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc("search_user_memories", {
    p_user_id: userId,
    p_embedding: JSON.stringify(queryEmbedding),
    p_limit: limit,
    p_threshold: threshold,
  });

  if (error) {
    console.error("[Memory] Search error:", error);
    return [];
  }

  return (data || []) as UserMemory[];
}

// ============================================================
// Fetch all memories for a user (for context window)
// ============================================================
export async function getAllMemories(
  userId: string,
  category?: MemoryCategory
): Promise<UserMemory[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("user_memories")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Memory] Fetch error:", error);
    return [];
  }

  return (data || []) as UserMemory[];
}

// ============================================================
// Update the user profile's aggregate memory vector
// This is used for "who is this user at a glance" embeddings
// ============================================================
export async function updateProfileVector(userId: string): Promise<void> {
  const supabase = createAdminClient();

  const memories = await getAllMemories(userId);
  if (!memories.length) return;

  // Build a rich persona string from all memories
  const personaText = memories
    .map((m) => `${m.key}: ${m.value}`)
    .join(". ");

  const embedding = await generateEmbedding(personaText);

  await supabase
    .from("user_profiles")
    .update({
      memory_vector: JSON.stringify(embedding),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

// ============================================================
// Process verbal feedback and extract memory updates
// e.g. "That hotel lounge was too dark" → dislikes: dim_lighting
// ============================================================
export async function processFeedback(
  userId: string,
  feedback: string,
  context?: {
    itinerary_id?: string;
    node_id?: string;
  }
): Promise<Partial<UserMemory>[]> {
  // This is called from the Memory Updater agent which handles the LLM extraction.
  // Here we persist the interaction log.
  const supabase = createAdminClient();

  await supabase.from("interactions").insert({
    user_id: userId,
    itinerary_id: context?.itinerary_id || null,
    node_id: context?.node_id || null,
    type: "feedback",
    content: feedback,
  });

  return [];
}

// ============================================================
// Log an itinerary node interaction (accept / reject)
// ============================================================
export async function logInteraction(
  userId: string,
  type: "accept" | "reject" | "pivot" | "feedback" | "voice_command",
  content?: string,
  context?: {
    itinerary_id?: string;
    node_id?: string;
    extracted_memory?: object;
  }
): Promise<void> {
  const supabase = createAdminClient();

  await supabase.from("interactions").insert({
    user_id: userId,
    type,
    content: content || null,
    itinerary_id: context?.itinerary_id || null,
    node_id: context?.node_id || null,
    extracted_memory: context?.extracted_memory || null,
  });
}
