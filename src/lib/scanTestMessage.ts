import type { MessageDetails } from '@/components/screens/EditMessageScreen';

export const SCAN_TEST_MESSAGE_NAME = 'SCAN-TEST';

export function buildScanTestMessage(): MessageDetails {
  return {
    name: SCAN_TEST_MESSAGE_NAME,
    height: 32,
    width: 200,
    templateValue: '32',
    fields: [
      {
        id: 1,
        type: 'barcode',
        data: '1A4060300003E16000007737',
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        fontSize: 'Standard7High',
        promptBeforePrint: true,
        promptLabel: 'SCAN CODE',
        promptLength: 32,
      },
      {
        id: 2,
        type: 'text',
        data: 'SCAN TO PRINT',
        x: 38,
        y: 18,
        width: 112,
        height: 7,
        fontSize: 'Standard7High',
      },
    ],
    settings: {
      speed: 'Fast',
      rotation: 'Normal',
      printMode: 'Normal',
    },
  };
}