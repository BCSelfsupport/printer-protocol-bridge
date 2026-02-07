/**
 * Template Parser for BestCode printer template files (.BIN)
 * 
 * Template files define the line structure for multi-line message formats.
 * File format (BCC002):
 * - Header: "BCC002" + padding
 * - Template metadata
 * - Line definitions
 */

export interface TemplateLine {
  index: number;
  startY: number;  // Starting Y position in dots
  height: number;  // Line height in dots
}

export interface ParsedTemplate {
  name: string;
  header: string;
  totalHeight: number;
  lines: TemplateLine[];
  rawData?: Uint8Array;
}

/**
 * Parse a BestCode template file
 */
export async function parseTemplateFile(url: string): Promise<ParsedTemplate | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to fetch template file:', response.status);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    return parseTemplateData(data, url);
  } catch (error) {
    console.error('Error parsing template file:', error);
    return null;
  }
}

/**
 * Parse raw template data
 */
export function parseTemplateData(data: Uint8Array, name: string = 'unknown'): ParsedTemplate | null {
  if (data.length < 16) {
    console.error('Template file too small');
    return null;
  }
  
  // Read header (first 6 bytes should be "BCC002" for template files)
  const headerBytes = data.slice(0, 6);
  const header = String.fromCharCode(...headerBytes);
  
  console.log('Template header:', header);
  console.log('Template size:', data.length, 'bytes');
  console.log('First 64 bytes:', Array.from(data.slice(0, 64)));
  
  // Try to extract template info from filename
  const fileName = name.split('/').pop()?.replace('.BIN', '') || 'unknown';
  
  // Parse based on known file naming patterns (e.g., "5L5U" = 5 lines, 5 units/dots each)
  const lineMatch = fileName.match(/(\d+)L(\d+)U/i);
  
  if (lineMatch) {
    const numLines = parseInt(lineMatch[1]);
    const dotsPerLine = parseInt(lineMatch[2]);
    const totalHeight = numLines * dotsPerLine;
    
    // Generate line definitions
    const lines: TemplateLine[] = [];
    const startY = 32 - totalHeight; // Start from top of usable area
    
    for (let i = 0; i < numLines; i++) {
      lines.push({
        index: i,
        startY: startY + (i * dotsPerLine),
        height: dotsPerLine,
      });
    }
    
    console.log('Parsed template:', { name: fileName, numLines, dotsPerLine, totalHeight, lines });
    
    return {
      name: fileName,
      header,
      totalHeight,
      lines,
      rawData: data,
    };
  }
  
  // Try to parse from binary data structure
  // Looking at the binary, we need to understand the format better
  // For now, return null if we can't parse the filename pattern
  console.warn('Could not parse template structure from:', fileName);
  return null;
}

/**
 * Convert parsed template to the format used by MessageCanvas
 */
export function templateToMultilineConfig(template: ParsedTemplate): {
  lines: number;
  dotsPerLine: number;
  height: number;
  value: string;
  label: string;
} | null {
  if (!template || template.lines.length === 0) return null;
  
  const numLines = template.lines.length;
  const dotsPerLine = template.lines[0].height;
  
  return {
    lines: numLines,
    dotsPerLine,
    height: template.totalHeight,
    value: `multi-${numLines}x${dotsPerLine}`,
    label: `${numLines} lines × ${dotsPerLine} dots`,
  };
}

/**
 * Load and cache templates from public folder
 */
const templateCache = new Map<string, ParsedTemplate>();

export async function loadTemplate(fileName: string): Promise<ParsedTemplate | null> {
  const cacheKey = fileName;
  
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey)!;
  }
  
  const template = await parseTemplateFile(`/templates/${fileName}`);
  
  if (template) {
    templateCache.set(cacheKey, template);
  }
  
  return template;
}

/**
 * Get all available templates from the templates folder
 * For now, we'll check for known template files
 */
export async function getAvailableTemplates(): Promise<ParsedTemplate[]> {
  const knownTemplates = [
    '5L5U.BIN',
    // Add more template files here as they become available
  ];
  
  const templates: ParsedTemplate[] = [];
  
  for (const file of knownTemplates) {
    const template = await loadTemplate(file);
    if (template) {
      templates.push(template);
    }
  }
  
  return templates;
}
