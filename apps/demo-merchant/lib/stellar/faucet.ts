export async function fundTestnetAccount(publicKey: string): Promise<boolean> {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited by Friendbot. Please try again later.');
    }
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.detail || 'Failed to fund account.');
  }
  return true;
}
