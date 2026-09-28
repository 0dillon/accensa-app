import { fundTestnetAccount } from './faucet';

// Simple mock for tests
global.fetch = jest.fn() as any;

describe('fundTestnetAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    await expect(fundTestnetAccount('GTEST123')).resolves.toBe(true);
  });

  it('throws on rate limit', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(fundTestnetAccount('GTEST123')).rejects.toThrow('Rate limited');
  });
});
