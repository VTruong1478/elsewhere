import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ place_id: string }> },
) {
  const { place_id: placeId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("saved")
    .delete()
    .eq("user_id", user.id)
    .eq("place_id", placeId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[saved] delete error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to unsave place" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Saved entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
