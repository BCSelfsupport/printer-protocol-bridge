const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_OWNER = "BCSelfsupport";
const GITHUB_REPO = "printer-protocol-bridge";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch latest release from GitHub API
    const ghToken = Deno.env.get("GITHUB_PAT");
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "CodeSync-Installer",
    };
    if (ghToken) {
      headers.Authorization = `Bearer ${ghToken}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { headers }
    );

    if (!res.ok) {
      console.error("GitHub API error:", res.status, await res.text());
      return new Response(
        JSON.stringify({ error: "Could not fetch latest release" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const release = await res.json();

    // Find the .exe installer asset
    const exeAsset = release.assets?.find(
      (a: any) => a.name.endsWith(".exe")
    );

    if (!exeAsset) {
      return new Response(
        JSON.stringify({ error: "No installer found in latest release" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Redirect to the download URL (browser_download_url is public for public repos)
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: exeAsset.browser_download_url,
        "Content-Disposition": `attachment; filename="CodeSync-Setup.exe"`,
      },
    });
  } catch (err) {
    console.error("download-installer error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
