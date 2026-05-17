// ============================================================
// createVolunteer — Supabase Edge Function
//
// Creates a new volunteer account for technical (app-using)
// volunteers. Uses the service role key to create an auth user
// without sending an invite email immediately.
// The profile is created with invite_pending = true so the
// admin can send invites in bulk later.
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { full_name, email, ministry, is_non_technical } = await req.json();

    // Create the auth user without sending an email
    // email_confirm: false means they don't need to confirm email
    // before we're ready to send invites
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { full_name },
      });

    if (authError) throw authError;

    // Update the profile created by the trigger to add
    // ministry and invite_pending fields
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        ministry,
        is_non_technical,
        // Technical volunteers get invite_pending = true so admin
        // can send invites in bulk later. Non-technical volunteers
        // never log in so no invite is needed.
        invite_pending: !is_non_technical,
        is_active: true,
      })
      .eq("id", authData.user.id);

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ success: true, user_id: authData.user.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
