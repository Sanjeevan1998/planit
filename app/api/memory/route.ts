import { NextRequest, NextResponse } from "next/server";
import { getAllMemories, storeMemory, storeBatchMemories, searchMemories } from "@/lib/supabase/memory";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemoryCategory } from "@/types";

// GET /api/memory?user_id=...&category=...&q=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const category = searchParams.get("category") as MemoryCategory | null;
  const query = searchParams.get("q");

  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const memories = query
    ? await searchMemories(userId, query)
    : await getAllMemories(userId, category || undefined);

  return NextResponse.json({ memories });
}

// POST /api/memory — store one or many memories
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, memory, memories } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    // Ensure user_profiles row exists (other tables FK to it)
    const supabase = createAdminClient();
    await supabase
      .from("user_profiles")
      .upsert({ id: user_id, email: `${user_id}@planit.local` }, { onConflict: "id", ignoreDuplicates: true });

    if (memories?.length) {
      await storeBatchMemories(user_id, memories);
      return NextResponse.json({ success: true, count: memories.length });
    }

    if (memory) {
      const result = await storeMemory(user_id, memory);
      return NextResponse.json({ memory: result });
    }

    return NextResponse.json({ error: "memory or memories required" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// DELETE /api/memory?user_id=...&key=...
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const key = searchParams.get("key");

  if (!userId || !key) {
    return NextResponse.json({ error: "user_id and key required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  await supabase.from("user_memories").delete().eq("user_id", userId).eq("key", key);

  return NextResponse.json({ success: true });
}
