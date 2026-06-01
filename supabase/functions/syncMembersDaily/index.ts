// ============================================================
// syncMembersDaily — Supabase Edge Function
//
// Fetches all people from the Planning Center People API
// and upserts them into the local `members` table.
//
// Triggered daily by pg_cron. Can also be invoked manually
// from the Supabase dashboard for testing.
//
// Authentication: Planning Center uses HTTP Basic Auth.
// PCO_PERSONAL_ACCESS_TOKEN is stored as "app_id:secret"
// and must be base64-encoded for the Authorization header.
//
// The service role key is used to bypass RLS when writing
// to the members table. It is never exposed to the client.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Planning Center API base URL and version
const PCO_BASE_URL = "https://api.planningcenteronline.com/people/v2";
const PCO_API_VERSION = "2025-11-10";

// How many records to fetch per page from Planning Center.
// 100 is the maximum allowed by the API.
const PAGE_SIZE = 100;

Deno.serve(async (req: Request) => {
  // Allow both POST (from pg_cron) and GET (for manual testing)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // --------------------------------------------------------
    // 1. Validate required environment variables
    // --------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const pcoToken = Deno.env.get("PCO_PERSONAL_ACCESS_TOKEN");

    if (!supabaseUrl || !serviceRoleKey || !pcoToken) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or PCO_PERSONAL_ACCESS_TOKEN",
      );
    }

    // --------------------------------------------------------
    // 2. Initialize Supabase client with service role key.
    //    This bypasses RLS so we can write to the members table.
    // --------------------------------------------------------
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --------------------------------------------------------
    // 3. Build the Planning Center Basic Auth header.
    //    PCO_PERSONAL_ACCESS_TOKEN format: "app_id:secret"
    //    Must be base64-encoded for the Authorization header.
    // --------------------------------------------------------
    const encodedToken = btoa(pcoToken);
    const pcoHeaders = {
      Authorization: `Basic ${encodedToken}`,
      "X-PCO-API-Version": PCO_API_VERSION,
      "Content-Type": "application/json",
    };

    // --------------------------------------------------------
    // 4. Fetch all people from Planning Center with pagination.
    //    The API returns paginated results; we loop until there
    //    are no more pages.
    // --------------------------------------------------------
    const allPeople: PCOPerson[] = [];
    let nextUrl: string | null =
      `${PCO_BASE_URL}/people?per_page=${PAGE_SIZE}&where[status]=active&fields[Person]=first_name,last_name,birthdate,membership`;

    let pageCount = 0;

    while (nextUrl) {
      pageCount++;
      console.log(`Fetching page ${pageCount}: ${nextUrl}`);

      const response = await fetch(nextUrl, { headers: pcoHeaders });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Planning Center API error (${response.status}): ${errorText}`,
        );
      }

      const data = await response.json();

      // Extract people from this page
      if (data.data && Array.isArray(data.data)) {
        allPeople.push(...data.data);
      }

      // Check if there is a next page
      nextUrl = data.links?.next ?? null;
    }

    console.log(
      `Total people fetched from Planning Center: ${allPeople.length}`,
    );

    // --------------------------------------------------------
    // 5. Fetch email and phone data for all people.
    //    Planning Center returns emails and phones as separate
    //    included resources linked by relationships.
    //    We fetch them in bulk to avoid N+1 requests.
    // --------------------------------------------------------
    // Fetch all emails
    const emailMap = await fetchContactDetails(
      `${PCO_BASE_URL}/emails?per_page=${PAGE_SIZE}`,
      pcoHeaders,
    );

    // Fetch all phone numbers
    const phoneMap = await fetchContactDetails(
      `${PCO_BASE_URL}/phone_numbers?per_page=${PAGE_SIZE}`,
      pcoHeaders,
    );

    // Fetch all physical addresses
    const addressMap = await fetchAddressDetails(
      `${PCO_BASE_URL}/addresses?per_page=${PAGE_SIZE}`,
      pcoHeaders,
    );

    // --------------------------------------------------------
    // 6. Transform Planning Center records into our members
    //    table format and upsert in batches.
    // --------------------------------------------------------
    const members = allPeople.map((person) => {
      const personId = person.id;
      const attrs = person.attributes ?? {};

      return {
        id: personId,
        first_name: attrs.first_name ?? "",
        last_name: attrs.last_name ?? "",
        email: emailMap[personId] ?? null,
        phone: phoneMap[personId] ?? null,
        address: addressMap[personId] ?? null,
        birthday: attrs.birthdate ?? null,
        membership_type: attrs.membership ?? null,
        last_synced: new Date().toISOString(),
      };
    });

    // Upsert in batches of 50 to avoid request size limits.
    // ON CONFLICT (id) → update all fields except id.
    const BATCH_SIZE = 50;
    let upsertedCount = 0;

    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE);

      const { error } = await supabase.from("members").upsert(batch, {
        onConflict: "id",
        ignoreDuplicates: false, // always update existing records
      });

      if (error) {
        throw new Error(`Supabase upsert error: ${error.message}`);
      }

      upsertedCount += batch.length;
      console.log(`Upserted ${upsertedCount} / ${members.length} members`);
    }

    // --------------------------------------------------------
    // 7. Clean up pending assignments for members who are now
    //    classified as child or teen in Planning Center.
    //    These members are excluded from assignment generation,
    //    but may have been assigned in a prior cycle before their
    //    membership type changed.
    // --------------------------------------------------------
    const childTeenIds = members
      .filter((m) => {
        if (!m.membership_type) return false;
        const t = m.membership_type.toLowerCase();
        return t.includes("child") || t.includes("teen");
      })
      .map((m) => m.id);

    if (childTeenIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("assignments")
        .delete()
        .in("member_id", childTeenIds)
        .eq("status", "pending");

      if (deleteError) {
        console.warn(
          "Warning: failed to clean up child/teen assignments:",
          deleteError.message,
        );
      } else {
        console.log(
          `Cleaned up pending assignments for ${childTeenIds.length} child/teen members`,
        );
      }
    }

    const summary = {
      success: true,
      total_fetched: allPeople.length,
      total_upserted: upsertedCount,
      pages_fetched: pageCount,
      synced_at: new Date().toISOString(),
    };

    console.log("Sync complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("syncMembersDaily error:", message);

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// TYPES
// ============================================================

interface PCOPerson {
  id: string;
  attributes?: {
    first_name?: string;
    last_name?: string;
    birthdate?: string | null;
    membership?: string | null;
  };
}

interface PCOAddress {
  id: string;
  attributes?: {
    street_line_1?: string | null;
    street_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    primary?: boolean;
  };
  relationships?: {
    person?: { data?: { id?: string } };
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Fetches a paginated PCO endpoint (emails or phone_numbers)
 * and returns a map of { person_id → primary value }.
 *
 * We look for the record where `primary: true` for each person.
 * If none is marked primary, we fall back to the first one found.
 */
async function fetchContactDetails(
  startUrl: string,
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  const resultMap: Record<string, string> = {};
  // Track the first-found value as fallback if no primary exists
  const fallbackMap: Record<string, string> = {};

  let nextUrl: string | null = startUrl;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });

    if (!response.ok) {
      // Non-fatal: log and return what we have
      console.warn(
        `Failed to fetch contact details from ${nextUrl}: ${response.status}`,
      );
      break;
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        const personId = item.relationships?.person?.data?.id;
        const value = item.attributes?.address ?? item.attributes?.number;
        const isPrimary = item.attributes?.primary === true;

        if (!personId || !value) continue;

        // Store fallback (first found for this person)
        if (!fallbackMap[personId]) {
          fallbackMap[personId] = value;
        }

        // Override with primary if found
        if (isPrimary) {
          resultMap[personId] = value;
        }
      }
    }

    nextUrl = data.links?.next ?? null;
  }

  // Merge fallbacks for any person who had no primary marked
  for (const [personId, value] of Object.entries(fallbackMap)) {
    if (!resultMap[personId]) {
      resultMap[personId] = value;
    }
  }

  return resultMap;
}

/**
 * Fetches the PCO /addresses endpoint and returns a map of
 * { person_id → formatted address string }.
 *
 * PCO addresses are structured objects, so we format them into
 * a single line: "123 Main St, City, ST 12345".
 * Primary address wins; first found is the fallback.
 */
async function fetchAddressDetails(
  startUrl: string,
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  const resultMap: Record<string, string> = {};
  const fallbackMap: Record<string, string> = {};

  let nextUrl: string | null = startUrl;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });

    if (!response.ok) {
      console.warn(
        `Failed to fetch addresses from ${nextUrl}: ${response.status}`,
      );
      break;
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data as PCOAddress[]) {
        const personId = item.relationships?.person?.data?.id;
        if (!personId) continue;

        const a = item.attributes ?? {};
        const parts = [a.street_line_1, a.street_line_2].filter(Boolean);
        const street = parts.join(" ");
        const cityLine = [a.city, a.state].filter(Boolean).join(", ");
        const formatted = [street, cityLine, a.zip].filter(Boolean).join(", ");

        if (!formatted) continue;

        if (!fallbackMap[personId]) {
          fallbackMap[personId] = formatted;
        }
        if (a.primary === true) {
          resultMap[personId] = formatted;
        }
      }
    }

    nextUrl = data.links?.next ?? null;
  }

  for (const [personId, value] of Object.entries(fallbackMap)) {
    if (!resultMap[personId]) {
      resultMap[personId] = value;
    }
  }

  return resultMap;
}
