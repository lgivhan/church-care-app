// ============================================================
// sendPendingInvites — Supabase Edge Function
//
// Sends invite emails to all volunteers where invite_pending = true.
// Uses Supabase's built-in invite flow which sends a magic link
// the volunteer clicks to set their password.
// invite_pending is NOT cleared here — it stays true until the
// volunteer logs in for the first time (cleared by ProtectedRoute).
// This allows admins to resend invites as many times as needed.
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

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerAuthError } =
      await userClient.auth.getUser();
    if (callerAuthError || !callerData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .single();
    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: if user_id is provided, send only to that one volunteer
    const body = await req.json().catch(() => ({}));
    const targetUserId: string | null = body?.user_id ?? null;

    let query = supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("invite_pending", true)
      .eq("is_non_technical", false);

    if (targetUserId) {
      query = query.eq("id", targetUserId);
    }

    const { data: pendingProfiles, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!pendingProfiles || pendingProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;

    for (const profile of pendingProfiles) {
      const redirectTo = `${siteUrl}/accept-invite`;

      const { error: inviteError } =
        await supabase.auth.admin.inviteUserByEmail(profile.email, {
          redirectTo,
        });

      if (inviteError) {
        // inviteUserByEmail fails for users who already clicked a previous
        // invite link (Supabase marks them as confirmed). Fall back to a
        // password recovery email, which also lands on /accept-invite and
        // lets the volunteer set their password.
        if (inviteError.message.includes("already been registered")) {
          const { error: resetError } =
            await supabase.auth.resetPasswordForEmail(profile.email, {
              redirectTo,
            });
          if (resetError) {
            console.error(
              `Failed to resend to ${profile.email}:`,
              resetError.message,
            );
            continue;
          }
        } else {
          console.error(
            `Failed to invite ${profile.email}:`,
            inviteError.message,
          );
          continue;
        }
      }

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
