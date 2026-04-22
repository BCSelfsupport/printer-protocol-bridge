import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // GET - list all training videos
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("training_videos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const videos = (data || []).map((v: any) => {
        const { data: urlData } = supabase.storage
          .from("training-videos")
          .getPublicUrl(v.file_path);

        let thumbnailUrl = null;
        if (v.thumbnail_path) {
          const { data: thumbData } = supabase.storage
            .from("training-videos")
            .getPublicUrl(v.thumbnail_path);
          thumbnailUrl = thumbData?.publicUrl;
        }

        return {
          ...v,
          video_url: urlData?.publicUrl,
          thumbnail_url: thumbnailUrl,
        };
      });

      return new Response(JSON.stringify(videos), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - register video metadata (file already uploaded directly to storage)
    if (req.method === "POST") {
      const body = await req.json();
      const {
        title,
        description = null,
        category = "general",
        duration_seconds = 0,
        file_path,
        thumbnail_path = null,
        file_size_bytes = 0,
      } = body;

      if (!title || !file_path) {
        return new Response(JSON.stringify({ error: "title and file_path required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: record, error: insertError } = await supabase
        .from("training_videos")
        .insert({
          title,
          description,
          category,
          file_path,
          thumbnail_path,
          duration_seconds,
          file_size_bytes,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return new Response(JSON.stringify(record), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE - remove a training video
    if (req.method === "DELETE") {
      const { id } = await req.json();
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: record } = await supabase
        .from("training_videos")
        .select("*")
        .eq("id", id)
        .single();

      if (record) {
        await supabase.storage.from("training-videos").remove([record.file_path]);
        if (record.thumbnail_path) {
          await supabase.storage.from("training-videos").remove([record.thumbnail_path]);
        }
        await supabase.from("training_videos").delete().eq("id", id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
