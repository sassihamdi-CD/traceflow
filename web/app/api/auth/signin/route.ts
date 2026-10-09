import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  return NextResponse.json({ user: data.user, session: data.session });
}
