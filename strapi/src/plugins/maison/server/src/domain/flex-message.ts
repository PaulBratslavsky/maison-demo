export interface ConfirmationMessageInput {
  houseName: string;
  reference: string;
  boutiqueName: string;
  boutiqueAddress: string;
  requestedForText: string;
  productNames: string[];
  appLink: string;
}

export interface FlexMessage {
  altText: string;
  contents: Record<string, unknown>;
}

// The app's black-and-white palette: ink on white, white on ink, and a grey that keeps 4.6:1 on white.
const INK = '#0a0a0a';
const WHITE = '#ffffff';
const MUTED = '#737373';

/** LINE rejects empty text nodes, so empty values become a dash. */
const nonEmpty = (value: string) => (value.trim().length > 0 ? value : '—');

const row = (label: string, value: string) => ({
  type: 'box',
  layout: 'baseline',
  spacing: 'sm',
  contents: [
    { type: 'text', text: label, size: 'sm', color: MUTED, flex: 2 },
    { type: 'text', text: nonEmpty(value), size: 'sm', color: INK, flex: 5, wrap: true },
  ],
});

/** Japanese confirmation bubble, ready for LINE Bot MCP's push_flex_message. */
export function buildConfirmationMessage(input: ConfirmationMessageInput): FlexMessage {
  return {
    altText: `ご来店予約が確定しました（${input.reference}）`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: INK,
        paddingAll: '16px',
        contents: [{ type: 'text', text: nonEmpty(input.houseName), color: WHITE, align: 'center', weight: 'bold' }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: 'ご来店予約が確定しました', weight: 'bold', size: 'lg', wrap: true },
          row('予約番号', input.reference),
          row('ブティック', input.boutiqueName),
          row('住所', input.boutiqueAddress),
          row('日時', input.requestedForText),
          row('お品物', input.productNames.join('、')),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'primary', color: INK, action: { type: 'uri', label: '予約を確認する', uri: input.appLink } },
        ],
      },
    },
  };
}
