import { parseOfacCsv, rowToSdn, rowToAlt } from '../../src/utils/ofac-csv';

const ADDR = '0x1111111111111111111111111111111111111111';
const SDN =
  `1001,"TEST, ENTITY","individual","CYBER2",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Digital Currency Address - ETH ${ADDR}; Linked To: X."\n` +
  `\n` +
  `1002,"NO ADDR","entity","SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Website x.example"\n`;

describe('ofac-csv', () => {
  it('parses quotes, -0- and skips empty lines', () => {
    const rows = parseOfacCsv(SDN);
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe('TEST, ENTITY');
    expect(rows[0][4]).toBe('');
    expect(rowToSdn(rows[0]).remarks).toContain(`Digital Currency Address - ETH ${ADDR}`);
    expect(rowToSdn(rows[1]).sdn_name).toBe('NO ADDR');
  });
  it('rowToAlt maps columns', () => {
    const alt = rowToAlt(parseOfacCsv('1001,5,"aka","Name",-0- \n')[0]);
    expect(alt).toMatchObject({ ent_num: 1001, alt_num: 5, alt_name: 'Name', alt_remarks: '' });
  });
});
