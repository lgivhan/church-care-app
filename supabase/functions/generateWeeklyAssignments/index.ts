// ============================================================
// generateWeeklyAssignments — Supabase Edge Function
//
// Calls the generate_weekly_assignments() SQL function which
// distributes church members across active volunteers for the
// current week.
//
// Triggered weekly by pg_cron every Sunday at 3am EST.
// Can also be invoked manually from the Supabase dashboard.
//
// The actual assignment logic lives entirely in the SQL function
// (see 001_initial_schema.sql). This Edge Function is a thin
// wrapper that invokes it and returns the result.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // Allow both POST (from pg_cron) and GET (for manual testing)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // --------------------------------------------------------
    // 1. Validate required environment variables.
    //    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
    //    automatically by Supabase — no need to set them manually.
    // --------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    // --------------------------------------------------------
    // 2. Initialize Supabase client with service role key.
    //    Required to call RPC functions with SECURITY DEFINER.
    // --------------------------------------------------------
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --------------------------------------------------------
    // 3. Call the SQL function that generates assignments.
    //    The function is idempotent — if assignments already
    //    exist for this week it exits early without duplicating.
    // --------------------------------------------------------
    const { error } = await supabase.rpc("generate_weekly_assignments");

    if (error) {
      throw new Error(`Failed to generate assignments: ${error.message}`);
    }

    // --------------------------------------------------------
    // 4. Return a count of assignments created this week
    //    so the caller can confirm it worked.
    // --------------------------------------------------------
    const weekStarting = getThisSunday();

    const { count, error: countError } = await supabase
      .from("assignments")
      .select("*", { count: "exact", head: true })
      .eq("week_starting", weekStarting);

    if (countError) {
      // Non-fatal — assignments were still generated, we just
      // couldn't count them for the response.
      console.warn("Could not count assignments:", countError.message);
    }

    const summary = {
      success: true,
      week_starting: weekStarting,
      assignments_created: count ?? "unknown",
      generated_at: new Date().toISOString(),
    };

    console.log("Assignment generation complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generateWeeklyAssignments error:", message);

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// HELPERS
// ============================================================

/**
 * Returns this week's Sunday as a YYYY-MM-DD string.
 * Matches the same logic used in the SQL function:
 *   date_trunc('week', CURRENT_DATE + INTERVAL '1 day') - INTERVAL '1 day'
 *
 * JavaScript's getDay() returns 0 for Sunday, so we subtract
 * the current day index to roll back to Sunday.
 */
function getThisSunday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);

  // Format as YYYY-MM-DD to match PostgreSQL DATE type
  return sunday.toISOString().split("T")[0];
}
