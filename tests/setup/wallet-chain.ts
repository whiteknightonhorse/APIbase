import { setSignaturePublicClient } from '../../src/shop/wallet-signature';

/**
 * Unit tests never touch an RPC: every address is an EOA (no code) unless a test installs its own
 * client with setSignaturePublicClient. Contract-wallet cases: tests/unit/shop-wallet-signature.test.ts.
 */
beforeEach(() => {
  setSignaturePublicClient({
    getCode: async () => '0x',
    verifyMessage: async () => {
      throw new Error('contract path not expected for an EOA');
    },
  });
});
