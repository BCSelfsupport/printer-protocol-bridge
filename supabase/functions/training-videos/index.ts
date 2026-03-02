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
    const url = new URL(req.url);

    // GET - list all training videos
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("training_videos")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Generate public URLs for each video
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

    // POST - upload a new training video
    if (req.method === "POST") {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const title = formData.get("title") as string;
      const description = formData.get("description") as string || null;
      const category = formData.get("category") as string || "general";
      const durationSeconds = parseInt(formData.get("duration_seconds") as string || "0");

      if (!file || !title) {
        return new Response(JSON.stringify({ error: "file and title required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 5 minute limit = ~300MB max for screen recordings
      if (durationSeconds > 300) {
        return new Response(JSON.stringify({ error: "Video exceeds 5 minute limit" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const timestamp = Date.now();
      const ext = file.name.split(".").pop() || "webm";
      const filePath = `videos/${timestamp}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("training-videos")
        .upload(filePath, arrayBuffer, {
          contentType: file.type || "video/webm",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Upload thumbnail if provided
      const thumbnail = formData.get("thumbnail") as File | null;
      let thumbnailPath: string | null = null;
      if (thumbnail) {
        thumbnailPath = `thumbnails/${timestamp}.png`;
        const thumbBuffer = await thumbnail.arrayBuffer();
        await supabase.storage
          .from("training-videos")
          .upload(thumbnailPath, thumbBuffer, {
            contentType: "image/png",
            upsert: false,
          });
      }

      const { data: record, error: insertError } = await supabase
        .from("training_videos")
        .insert({
          title,
          description,
          category,
          file_path: filePath,
          thumbnail_path: thumbnailPath,
          duration_seconds: durationSeconds,
          file_size_bytes: file.size,
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

      // Get the record first to delete the file
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
