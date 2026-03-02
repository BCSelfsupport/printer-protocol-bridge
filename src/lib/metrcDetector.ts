// METRC (cannabis track-and-trace) CSV auto-detection
// Detects common METRC export column patterns and pre-configures field mappings
// Updated to support Retail ID format (Unit Code URLs like https://d.1a4.com/...)

const METRC_TAG_COLUMNS = [
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
  'index', 'reel', 'kind',
];

export interface MetrcDetectionResult {
  isMetrc: boolean;
  confidence: 'high' | 'medium' | 'low';
  format: 'retail-id' | 'legacy-tag' | 'unknown';
  tagColumn: string | null;        // The column containing the UID/tag (for barcode)
  retailIdColumn: string | null;   // Retail ID column if present
  unitCodeColumn: string | null;   // Unit Code column (Retail ID URL)
  suggestedMappings: Record<string, { fieldIndex: number; fieldType: 'barcode' | 'text' }>;
}

export function detectMetrcCsv(columns: string[], sampleRow?: Record<string, string>): MetrcDetectionResult {
  const lowerCols = columns.map(c => c.toLowerCase().trim());
  
  // Find Unit Code column (Retail ID URL format)
  let unitCodeColumn: string | null = null;
  let unitCodeIndex = -1;
  for (let i = 0; i < columns.length; i++) {
    const lower = lowerCols[i];
    if (lower === 'unit code' || lower === 'unit_code' || lower === 'unitcode') {
      unitCodeColumn = columns[i];
      unitCodeIndex = i;
      break;
    }
  }

  // Find tag/UID column (legacy 24-char format)
  let tagColumn: string | null = null;
  for (let i = 0; i < columns.length; i++) {
    const lower = lowerCols[i];
    if (METRC_TAG_COLUMNS.includes(lower) && columns[i] !== unitCodeColumn) {
      tagColumn = columns[i];
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

  // Check sample row for Retail ID URL pattern
  let hasRetailIdUrl = false;
  if (sampleRow && unitCodeColumn) {
    const val = sampleRow[unitCodeColumn] || '';
    hasRetailIdUrl = isRetailIdUrl(val);
  }
  
  // Determine format
  let format: 'retail-id' | 'legacy-tag' | 'unknown' = 'unknown';
  if (unitCodeColumn) {
    format = 'retail-id';
  } else if (tagColumn) {
    format = 'legacy-tag';
  }
  
  // Determine confidence
  const hasTag = tagColumn !== null || unitCodeColumn !== null;
  const hasIndicators = indicatorCount >= 2;
  
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if ((hasTag && hasIndicators) || (unitCodeColumn && indicatorCount >= 1)) confidence = 'high';
  else if (hasTag || indicatorCount >= 3) confidence = 'medium';
  
  const isMetrc = confidence === 'high' || confidence === 'medium';
  
  // Build suggested mappings
  const suggestedMappings: Record<string, { fieldIndex: number; fieldType: 'barcode' | 'text' }> = {};
  let nextField = 1;
  
  // Unit Code (QR) gets priority for Retail ID format
  if (unitCodeColumn) {
    suggestedMappings[unitCodeColumn] = { fieldIndex: nextField++, fieldType: 'barcode' };
  } else if (tagColumn) {
    suggestedMappings[tagColumn] = { fieldIndex: nextField++, fieldType: 'barcode' };
  }

  if (retailIdColumn) {
    suggestedMappings[retailIdColumn] = { fieldIndex: nextField++, fieldType: 'text' };
  }
  
  // Also map Package Tag if present and not already used
  if (tagColumn && unitCodeColumn) {
    suggestedMappings[tagColumn] = { fieldIndex: nextField++, fieldType: 'text' };
  }
  
  return {
    isMetrc,
    confidence,
    format,
    tagColumn,
    retailIdColumn,
    unitCodeColumn,
    suggestedMappings,
  };
}

/** Check if a value looks like a METRC 24-char UID */
export function isMetrcUid(value: string): boolean {
  return /^[A-Z0-9]{24}$/i.test(value.trim());
}

/** Check if a value looks like a METRC Retail ID URL (e.g. https://d.1a4.com/...) */
export function isRetailIdUrl(value: string): boolean {
  return /^https?:\/\/d\.1a4\.com\//i.test(value.trim());
}
