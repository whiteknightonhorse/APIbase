/** T-0833: the signature is the single act of acceptance; old clients' value stays valid. */
jest.mock('../../src/config', () => ({ config: {} }));
import { acceptanceMethod } from '../../src/shop/merchant-lifecycle.service';

describe('acceptanceMethod', () => {
  it('the page and the one-signature path send wallet_signature', () => {
    expect(acceptanceMethod('eoa', 'wallet_signature')).toBe('wallet_signature');
  });
  it('a contract signer still gets contract_wallet_signature', () => {
    expect(acceptanceMethod('contract', 'wallet_signature')).toBe('contract_wallet_signature');
    expect(acceptanceMethod('contract', 'checkbox+wallet_signature')).toBe(
      'contract_wallet_signature',
    );
  });
  it('checkbox+wallet_signature from an old client is stored as such', () => {
    expect(acceptanceMethod('eoa', 'checkbox+wallet_signature')).toBe('checkbox+wallet_signature');
  });
});
