import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrinterCheckRequest {
  printers: {
    id: number;
    ipAddress: string;
    port: number;
  }[];
}

interface PrinterStatus {
  id: number;
  isAvailable: boolean;
  status: 'ready' | 'not_ready' | 'error' | 'offline';
  responseTime?: number;
  version?: string;
  error?: string;
}

async function checkPrinter(printer: { id: number; ipAddress: string; port: number }): Promise<PrinterStatus> {
  const startTime = Date.now();
  
  try {
    // Attempt TCP connection with timeout
    const conn = await Promise.race([
      Deno.connect({ hostname: printer.ipAddress, port: printer.port }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      )
    ]) as Deno.Conn;

    const responseTime = Date.now() - startTime;

    try {
      // Send a simple status query command (BestCode protocol uses ^ prefix)
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      // Query printer status - adjust command based on actual protocol
      await conn.write(encoder.encode("^S\r"));
      
      // Read response with timeout
      const buffer = new Uint8Array(1024);
      const bytesRead = await Promise.race([
        conn.read(buffer),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
      ]);

      conn.close();

      if (bytesRead && bytesRead > 0) {
        const response = decoder.decode(buffer.subarray(0, bytesRead));
        
        // Parse response to determine status
        // This would need to be adjusted based on actual BestCode protocol responses
        const isReady = response.includes('READY') || response.includes('OK');
        
        return {
          id: printer.id,
          isAvailable: true,
          status: isReady ? 'ready' : 'not_ready',
          responseTime,
          version: extractVersion(response),
        };
      }

      // Connected but no response - printer might be busy
      return {
        id: printer.id,
        isAvailable: true,
        status: 'not_ready',
        responseTime,
      };

    } catch (readError) {
      conn.close();
      // Connected but communication error
      return {
        id: printer.id,
        isAvailable: true,
        status: 'error',
        responseTime,
        error: 'Communication error',
      };
    }

  } catch (error) {
    // Connection failed - printer offline or unreachable
    return {
      id: printer.id,
      isAvailable: false,
      status: 'offline',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function extractVersion(response: string): string | undefined {
  // Try to extract version from response - adjust pattern based on actual protocol
  const versionMatch = response.match(/v?(\d+\.\d+\.\d+\.\d+)/i);
  return versionMatch ? `v${versionMatch[1]}` : undefined;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { printers } = await req.json() as PrinterCheckRequest;

    if (!printers || !Array.isArray(printers)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: printers array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check all printers in parallel
    const results = await Promise.all(printers.map(checkPrinter));

    return new Response(
      JSON.stringify({ printers: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking printer status:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});