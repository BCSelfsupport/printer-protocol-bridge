import type { MessageDetails } from '@/components/screens/EditMessageScreen';

export const SCAN_TEST_MESSAGE_NAME = 'SCAN-TEST';

/**
 * Bump this whenever the seed shape changes so existing localStorage entries
 * get overwritten with the corrected definition.
 */
export const SCAN_TEST_SEED_VERSION = 2;

/**
 * The seed sample value (a real METRC compliance tag) — also used by the
 * /scan demo overlay so the on-screen tag matches what the printer expects.
 */
export const SCAN_TEST_SAMPLE_VALUE = '1A4060300003E16000007737';

export function buildScanTestMessage(): MessageDetails {
  // 24-char alphanumeric METRC tag → QR Code Version 3 (29×29) holds 47 alpha chars.
  // The encoding prefix `[QRCODE|S=3]` is required by the canvas/protocol layer
  // to actually render a QR symbol instead of treating the data as plain text.
  const sampleData = SCAN_TEST_SAMPLE_VALUE;
  const qrSize = 29; // QR V3 = 29 dots tall

  return {
    name: SCAN_TEST_MESSAGE_NAME,
    height: 32,
    width: 100,
    templateValue: '32',
    fields: [
      {
        id: 1,
        type: 'barcode',
        // [ENCODING|S=size] <data>  — parsed by handleAddBarcode/MessageCanvas
        data: `[QRCODE|S=3] ${sampleData}`,
        x: 0,
        // Bottom-anchor inside 32-dot template
        y: 32 - qrSize,
        width: qrSize,
        height: qrSize,
        fontSize: 'Standard16High',
        bold: 0,
        // Per-field prompt + scan-source so selection routes to the camera wizard
        promptBeforePrint: true,
        promptLabel: 'SCAN CODE',
        promptLength: 32,
        inputSource: 'scan',
      },
      {
        id: 2,
        type: 'text',
        data: 'SCAN TO PRINT',
        // To the right of the QR with 4-dot gap
        x: qrSize + 4,
        // Anchor 7-high text to the bottom of the 32-dot template
        y: 32 - 7,
        width: 13 * 6, // ~13 chars × ~6 dots
        height: 7,
        fontSize: 'Standard7High',
        gap: 1,
      },
    ],
    settings: {
      speed: 'Fast',
      rotation: 'Normal',
      printMode: 'Normal',
    },
  };
}
