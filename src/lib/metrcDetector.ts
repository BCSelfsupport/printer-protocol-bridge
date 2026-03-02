// METRC (cannabis track-and-trace) CSV auto-detection
// Detects common METRC export column patterns and pre-configures field mappings

const METRC_COLUMNS = [
  'tag', 'uid', 'unit code', 'unit_code', 'unitcode',
  'retail id', 'retail_id', 'retailid',
  'package tag', 'package_tag', 'packagetag',
  'source tag', 'source_tag', 'sourcetag',
  'metrc tag', 'metrc_tag', 'metrctag',
  'tracking number', 'tracking_number',
];

const METRC_INDICATOR_COLUMNS = [
  'strain', 'strain name', 'strain_name',
  'thc', 'thc%', 'thc_percent',
  'cbd', 'cbd%', 'cbd_percent',
  'harvest', 'harvest date', 'harvest_date',
  'package type', 'package_type',
  'item', 'item name', 'item_name',
  'quantity', 'unit of measure',
  'license number', 'license_number',
  'facility', 'facility name',
];

export interface MetrcDetectionResult {
  isMetrc: boolean;
  confidence: 'high' | 'medium' | 'low';
  tagColumn: string | null;        // The column containing the UID/tag (for barcode)
  retailIdColumn: string | null;   // Retail ID column if present
  suggestedMappings: Record<string, { fieldIndex: number; fieldType: 'barcode' | 'text' }>;
}

export function detectMetrcCsv(columns: string[]): MetrcDetectionResult {
  const lowerCols = columns.map(c => c.toLowerCase().trim());
  
  // Find tag/UID column
  let tagColumn: string | null = null;
  let tagIndex = -1;
  for (const col of columns) {
    const lower = col.toLowerCase().trim();
    if (METRC_COLUMNS.includes(lower)) {
      tagColumn = col;
      tagIndex = columns.indexOf(col);
      break;
    }
  }
  
  // Find Retail ID column
  let retailIdColumn: string | null = null;
  for (const col of columns) {
    const lower = col.toLowerCase().trim();
    if (lower.includes('retail') && lower.includes('id')) {
      retailIdColumn = col;
      break;
    }
  }
  
  // Count METRC indicator columns
  let indicatorCount = 0;
  for (const col of lowerCols) {
    if (METRC_INDICATOR_COLUMNS.includes(col)) {
      indicatorCount++;
    }
  }
  
  // Determine confidence
  const hasTag = tagColumn !== null;
  const hasIndicators = indicatorCount >= 2;
  
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (hasTag && hasIndicators) confidence = 'high';
  else if (hasTag || indicatorCount >= 3) confidence = 'medium';
  
  const isMetrc = confidence === 'high' || confidence === 'medium';
  
  // Build suggested mappings
  const suggestedMappings: Record<string, { fieldIndex: number; fieldType: 'barcode' | 'text' }> = {};
  let nextField = 1;
  
  if (tagColumn) {
    suggestedMappings[tagColumn] = { fieldIndex: nextField++, fieldType: 'barcode' };
  }
  if (retailIdColumn) {
    suggestedMappings[retailIdColumn] = { fieldIndex: nextField++, fieldType: 'text' };
  }
  
  return {
    isMetrc,
    confidence,
    tagColumn,
    retailIdColumn,
    suggestedMappings,
  };
}

/** Check if a value looks like a METRC 24-char UID */
export function isMetrcUid(value: string): boolean {
  return /^[A-Z0-9]{24}$/i.test(value.trim());
}
