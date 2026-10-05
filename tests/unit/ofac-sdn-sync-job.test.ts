const query = jest.fn();
const exec = jest.fn();
jest.mock('../../src/services/prisma.service', () => ({
  getPrisma: () => ({ $queryRawUnsafe: query, $executeRawUnsafe: exec }),
}));

import { run } from '../../src/jobs/ofac-sdn-sync.job';

const SDN =
  '1001,"E","individual","CYBER2",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Digital Currency Address - ETH 0xAbC"\n';

describe('ofac-sdn-sync job skipIfFresh', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    query.mockReset();
    exec.mockReset();
    fetchMock = jest.fn(async () => ({ ok: true, text: async () => SDN }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });
  it('fresh table -> source not called', async () => {
    query.mockResolvedValue([{ fresh: true }]);
    await run({ skipIfFresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
  it('empty table -> source called', async () => {
    query.mockResolvedValue([{ fresh: null }]);
    await run({ skipIfFresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalled();
  });
  it('no flag -> always downloads', async () => {
    await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
