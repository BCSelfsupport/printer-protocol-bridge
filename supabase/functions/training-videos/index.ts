import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-license-key, x-admin-token, x-license-key, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
        manual_chapter_id = null,
        manual_section_id = null,
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
          manual_chapter_id,
          manual_section_id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return new Response(JSON.stringify(record), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PATCH - update metadata and/or replace the video file (after trimming)
    if (req.method === "PATCH") {
      const body = await req.json();
      const { id, file_path, ...rest } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("training_videos")
        .select("*")
        .eq("id", id)
        .single();

      const updates: Record<string, unknown> = {};
      for (const key of [
        "title",
        "description",
        "category",
        "duration_seconds",
        "file_size_bytes",
        "thumbnail_path",
        "manual_chapter_id",
        "manual_section_id",
      ]) {
        if (rest[key] !== undefined) updates[key] = rest[key];
      }
      if (file_path) updates.file_path = file_path;
      updates.updated_at = new Date().toISOString();

      const { data: record, error: updateError } = await supabase
        .from("training_videos")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Clean up the replaced file once the row points at the new one
      if (file_path && existing?.file_path && existing.file_path !== file_path) {
        await supabase.storage.from("training-videos").remove([existing.file_path]);
      }

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
