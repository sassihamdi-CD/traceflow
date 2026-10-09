import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOCALES = ["en", "it"] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") || "en";

  if (!LOCALES.includes(locale as any)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  try {
    const messagesPath = path.join(process.cwd(), "messages", `${locale}.json`);
    const messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"));
    return NextResponse.json(messages, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Messages not found" }, { status: 404 });
  }
}