// ============================================================
// sendWeeklyReminders — Supabase Edge Function
//
// Sends two types of emails to volunteers via Resend:
//
//   type=new_cycle  (Friday 8:30 AM UTC)
//     Tells each active volunteer how many contacts they have
//     this cycle. Only fires when assignments exist for today's
//     week_starting (i.e. a cycle actually generated today).
//
//   type=reminder   (Wednesday 8:00 AM UTC)
//     Tells each volunteer how many contacts they still have
//     pending. Only fires on the Wednesday that is exactly 12
//     days into an active cycle (the Wednesday before it ends).
//
// Auth: Bearer token must match the CRON_SECRET env var, which
// is also stored in the Supabase vault so pg_cron can retrieve
// it when calling this function.
//
// Skips paper-only (is_non_technical) volunteers — they don't
// use email to contact people.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // --------------------------------------------------------
    // 1. Validate environment variables
    // --------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const appUrl = Deno.env.get("SITE_URL") ?? "https://churchcare.app";
    const fromEmail =
      Deno.env.get("RESEND_FROM_EMAIL") ??
      "Church Care <noreply@churchcare.app>";

    if (!resendApiKey) throw new Error("Missing RESEND_API_KEY");
    if (!cronSecret) throw new Error("Missing CRON_SECRET");

    // --------------------------------------------------------
    // 2. Authenticate — Bearer token must match CRON_SECRET
    // --------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --------------------------------------------------------
    // 3. Parse request type
    // --------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const type: string = body?.type ?? "";
    if (type !== "new_cycle" && type !== "reminder") {
      return new Response(
        JSON.stringify({ error: 'type must be "new_cycle" or "reminder"' }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // --------------------------------------------------------
    // 4. Determine today's date in UTC
    // --------------------------------------------------------
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    // --------------------------------------------------------
    // 5. Find the active cycle and validate timing
    // --------------------------------------------------------

    // Most recent Friday — this is the week_starting for the current cycle.
    const dow = today.getUTCDay(); // 0=Sun … 5=Fri … 6=Sat
    const daysSinceFriday = (dow - 5 + 7) % 7;
    const fridayDate = new Date(today);
    fridayDate.setUTCDate(today.getUTCDate() - daysSinceFriday);
    const weekStarting = fridayDate.toISOString().split("T")[0];

    let emailType: "new_cycle" | "reminder";

    if (type === "new_cycle") {
      // Only proceed if today IS a Friday and assignments exist for it.
      if (daysSinceFriday !== 0) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "Today is not a Friday" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const { count } = await supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("week_starting", weekStarting);
      if (!count || count === 0) {
        return new Response(
          JSON.stringify({
            skipped: true,
            reason:
              "No assignments found for today — cycle may not have generated yet",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      emailType = "new_cycle";
    } else {
      // reminder: only proceed if today is exactly 12 days into an active cycle
      // (the Wednesday before the cycle wraps up on Friday).
      if (daysSinceFriday !== 5) {
        // daysSinceFriday === 5 means today is Wednesday (Fri+5 days = Wed)
        // Wait: Fri=0, Sat=1, Sun=2, Mon=3, Tue=4, Wed=5, Thu=6
        return new Response(
          JSON.stringify({ skipped: true, reason: "Today is not a Wednesday" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // weekStarting is the Friday 12 days ago — confirm assignments exist for it.
      const { count } = await supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("week_starting", weekStarting)
        .eq("status", "pending");
      if (!count || count === 0) {
        return new Response(
          JSON.stringify({
            skipped: true,
            reason: "No pending assignments found for this cycle",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      emailType = "reminder";
    }

    // --------------------------------------------------------
    // 6. Query volunteers and their assignment counts
    // --------------------------------------------------------
    const { data: rows, error: queryError } = await supabase
      .from("profiles")
      .select(
        `
        id,
        full_name,
        email,
        assignments!assignments_caller_id_fkey (
          id,
          status,
          week_starting
        )
      `,
      )
      .eq("is_active", true)
      .eq("is_non_technical", false)
      .in("role", ["volunteer", "admin"])
      .not("email", "is", null);

    if (queryError) throw queryError;

    // Filter to this cycle and compute counts per volunteer.
    const volunteers: {
      id: string;
      full_name: string;
      email: string;
      total: number;
      pending: number;
    }[] = [];

    for (const row of rows ?? []) {
      const cycleAssignments = (row.assignments ?? []).filter(
        (a: { week_starting: string; status: string }) =>
          a.week_starting === weekStarting,
      );
      const total = cycleAssignments.length;
      const pending = cycleAssignments.filter(
        (a: { status: string }) => a.status === "pending",
      ).length;

      if (emailType === "new_cycle" && total > 0) {
        volunteers.push({
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          total,
          pending,
        });
      } else if (emailType === "reminder" && pending > 0) {
        volunteers.push({
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          total,
          pending,
        });
      }
    }

    if (volunteers.length === 0) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "No eligible volunteers to email",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // --------------------------------------------------------
    // 7. Send emails via Resend
    // --------------------------------------------------------
    let sentCount = 0;
    const errors: string[] = [];

    for (const vol of volunteers) {
      const firstName =
        vol.full_name?.split(" ")[0] ?? vol.full_name ?? "there";
      const subject =
        emailType === "new_cycle"
          ? `You have ${vol.total} new ${vol.total === 1 ? "contact" : "contacts"} this care cycle`
          : `${vol.pending} ${vol.pending === 1 ? "contact" : "contacts"} still to reach this cycle`;

      const html =
        emailType === "new_cycle"
          ? buildNewCycleEmail(firstName, vol.total, appUrl)
          : buildReminderEmail(firstName, vol.pending, appUrl);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [vol.email],
          subject,
          html,
        }),
      });

      if (res.ok) {
        sentCount++;
      } else {
        const errText = await res.text();
        const msg = `Failed to send to ${vol.email}: ${errText}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    const summary = {
      success: true,
      type: emailType,
      week_starting: weekStarting,
      emails_sent: sentCount,
      errors: errors.length > 0 ? errors : undefined,
    };
    console.log("sendWeeklyReminders complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sendWeeklyReminders error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// EMAIL TEMPLATES
// ============================================================

function buildNewCycleEmail(
  firstName: string,
  count: number,
  appUrl: string,
): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf9;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
    <div style="background:linear-gradient(135deg,#fbbf24,#f97316);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Church Care</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 12px;font-size:16px;color:#1c1917;">Hi ${firstName},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#57534e;">
        You've been assigned <strong style="color:#1c1917;">${count} ${count === 1 ? "contact" : "contacts"}</strong>
        for this care cycle. Log in to see who they are and start reaching out.
      </p>
      <a href="${appUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
        Open Church Care →
      </a>
    </div>
    <div style="padding:16px 32px 24px;border-top:1px solid #f5f5f4;">
      <p style="margin:0;font-size:12px;color:#a8a29e;">${appUrl}</p>
    </div>
  </div>
</body>
</html>`;
}

function buildReminderEmail(
  firstName: string,
  pending: number,
  appUrl: string,
): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf9;font-family:sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
    <div style="background:linear-gradient(135deg,#fbbf24,#f97316);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Church Care</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 12px;font-size:16px;color:#1c1917;">Hi ${firstName},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#57534e;">
        Just a reminder — you still have
        <strong style="color:#1c1917;">${pending} ${pending === 1 ? "contact" : "contacts"}</strong>
        to reach before this cycle wraps up on Friday.
      </p>
      <a href="${appUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
        Open Church Care →
      </a>
    </div>
    <div style="padding:16px 32px 24px;border-top:1px solid #f5f5f4;">
      <p style="margin:0;font-size:12px;color:#a8a29e;">${appUrl}</p>
    </div>
  </div>
</body>
</html>`;
}
