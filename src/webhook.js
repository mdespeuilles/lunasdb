/**
 * Send backup summary to webhook URL
 */
export async function sendWebhook(webhookUrl, summary) {
  if (!webhookUrl) {
    return;
  }

  try {
    console.log('\nSending webhook notification...');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(summary)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook request failed with status ${response.status}: ${errorText}`);
    }

    console.log('✓ Webhook notification sent successfully');
  } catch (error) {
    console.error('✗ Failed to send webhook notification:', error.message);
    // Don't throw - webhook failure shouldn't stop the backup process
  }
}
