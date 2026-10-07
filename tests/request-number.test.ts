import { generateRequestNumber, generateOrderNumber } from '../src/utils/request-number';

describe('request-number utils', () => {
  it('generates SR numbers in SR-YYYYMMDD-### format', () => {
    const n = generateRequestNumber();
    expect(n).toMatch(/^SR-\d{8}-\d{3}$/);
  });

  it('generates WO numbers in WO-YYYYMMDD-### format', () => {
    const n = generateOrderNumber();
    expect(n).toMatch(/^WO-\d{8}-\d{3}$/);
  });

  it('embeds today as YYYYMMDD', () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(generateRequestNumber()).toContain(`SR-${today}-`);
  });
});
