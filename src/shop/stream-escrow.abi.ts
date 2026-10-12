/** `ChannelClosed` of the Tempo stream escrow (copied from mppx; mppx does not export its escrow ABI). */
export const CHANNEL_CLOSED_ABI = [
  {
    type: 'event',
    name: 'ChannelClosed',
    inputs: [
      { name: 'channelId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'payer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'payee', type: 'address', indexed: true, internalType: 'address' },
      { name: 'settledToPayee', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'refundedToPayer', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const;
