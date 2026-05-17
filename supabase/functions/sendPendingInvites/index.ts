// ============================================================
// sendPendingInvites — Supabase Edge Function
//
// Sends invite emails to all volunteers where invite_pending = true.
// Uses Supabase's built-in invite flow which sends a magic link
// the volunteer clicks to set their password.
// After sending, marks invite_pending = false on each profile.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl =
      Deno.env.get("SITE_URL") ?? "https://church-care-app.vercel.app";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all profiles with invite_pending = true
    const { data: pendingProfiles, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("invite_pending", true)
      .eq("is_non_technical", false);

    if (fetchError) throw fetchError;
    if (!pendingProfiles || pendingProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;

    for (const profile of pendingProfiles) {
      // Send invite email via Supabase admin
      const { error: inviteError } =
        await supabase.auth.admin.inviteUserByEmail(profile.email, {
          redirectTo: `${siteUrl}/login`,
        });

      if (inviteError) {
        console.error(
          `Failed to invite ${profile.email}:`,
          inviteError.message,
        );
        continue;
      }

      // Mark as no longer pending
      await supabase
        .from("profiles")
        .update({ invite_pending: false })
        .eq("id", profile.id);

      sentCount++;
    }

    return new Response(JSON.stringify({ success: true, count: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
