import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface JoinEventRequest {
  join_code: string;
  viewer_id: string;
  client_ts?: string;
}

interface JoinEventResponse {
  allowed: boolean;
  reason?: "full" | "not_found" | "ended" | "not_live" | "bad_request";
  message?: string;
  event?: {
    id: string;
    title: string;
    status: string;
    starts_at: string;
    ends_at: string;
    viewer_soft_limit: number;
  };
  signers?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    signature_url: string | null;
  }[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "bad_request",
          message: "Only POST method is allowed",
        }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let body: JoinEventRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "bad_request",
          message: "Invalid JSON body",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { join_code, viewer_id } = body;

    if (!join_code || typeof join_code !== "string" || join_code.trim() === "") {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "bad_request",
          message: "join_code is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!viewer_id || typeof viewer_id !== "string" || viewer_id.trim() === "") {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "bad_request",
          message: "viewer_id is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "bad_request",
          message: "Server configuration error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log(`[joinEvent] Attempting to join event with code: ${join_code.toUpperCase()}`);

    const { data, error } = await supabase.rpc("join_event", {
      p_join_code: join_code.trim().toUpperCase(),
      p_viewer_id: viewer_id.trim(),
    });

    if (error) {
      console.error(`[joinEvent] RPC error:`, error);
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "bad_request",
          message: error.message || "Failed to join event",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = data as JoinEventResponse;
    console.log(`[joinEvent] Result:`, JSON.stringify(result));

    const statusCode = result.allowed ? 200 : result.reason === "full" ? 429 : 400;

    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[joinEvent] Unexpected error:`, err);
    return new Response(
      JSON.stringify({
        allowed: false,
        reason: "bad_request",
        message: "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
