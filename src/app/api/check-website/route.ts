import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Common domain aliases/redirects
const DOMAIN_ALIASES: Record<string, string[]> = {
  "gmail.com": ["mail.google.com"],
  "mail.google.com": ["gmail.com"],
  "youtube.com": ["m.youtube.com", "www.youtube.com"],
  "twitter.com": ["x.com"],
  "x.com": ["twitter.com"],
};

export async function POST(req: Request) {
  try {
    const { userId, website } = await req.json();

    if (!userId || !website) {
      return NextResponse.json({ error: "Missing userId or website" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: reminders, error } = await supabaseAdmin
      .from("reminders")
      .select("id, raw_text, title, parsed")
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get all possible domains to check (including aliases)
    const domainsToCheck = [website, ...(DOMAIN_ALIASES[website] || [])];

    const matchedReminders = (reminders || []).filter((r) => {
      const triggers = r?.parsed?.triggers || [];
      return triggers.some((t: any) => {
        if (t.type !== "website") return false;
        
        const triggerDomain = t.value.toLowerCase().replace(/^www\./, '');
        
        // Check if trigger domain matches any of the domains to check
        return domainsToCheck.some(domain => {
          const currentDomain = domain.toLowerCase();
          return triggerDomain === currentDomain || 
                 currentDomain.includes(triggerDomain) ||
                 triggerDomain.includes(currentDomain);
        });
      });
    });

    if (matchedReminders.length > 0) {
      const reminderIds = matchedReminders.map(r => r.id);
      
      await supabaseAdmin
        .from("reminders")
        .update({ status: "completed" })
        .in("id", reminderIds);
    }

    return NextResponse.json({ reminders: matchedReminders });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}