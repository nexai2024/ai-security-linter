const { createHmac } = require('crypto');

// Set GITHUB_WEBHOOK_SECRET locally for test execution
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret-123';

async function runTests() {
  console.log('=== Webhook Validation Test ===');

  const payload = JSON.stringify({
    action: 'opened',
    pull_request: { number: 42, head: { sha: 'abcdef' } },
    repository: { id: 12345, name: 'test-repo', full_name: 'test-owner/test-repo', owner: { id: 9999, login: 'test-owner', type: 'User', avatar_url: 'http://avatar.url' } },
    installation: { id: 8888 }
  });

  const hmac = createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
  const validSignature = 'sha256=' + hmac.update(payload).digest('hex');

  try {
    // 1. Test Valid Signature
    console.log('Sending request with valid signature...');
    const resValid = await fetch('http://localhost:3000/api/webhook/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': validSignature,
        'x-github-event': 'pull_request',
        'content-type': 'application/json',
      },
      body: payload
    });
    console.log(`Response Status: ${resValid.status}`);
    const jsonValid = await resValid.json();
    console.log(`Response Payload:`, jsonValid);

    // 2. Test Invalid Signature
    console.log('\nSending request with invalid signature...');
    const resInvalid = await fetch('http://localhost:3000/api/webhook/github', {
      method: 'POST',
      headers: {
        'x-hub-signature-256': 'sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'x-github-event': 'pull_request',
        'content-type': 'application/json',
      },
      body: payload
    });
    console.log(`Response Status: ${resInvalid.status}`);
    const jsonInvalid = await resInvalid.json();
    console.log(`Response Payload:`, jsonInvalid);

    // 3. Test Missing Signature
    console.log('\nSending request with missing signature...');
    const resMissing = await fetch('http://localhost:3000/api/webhook/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'pull_request',
        'content-type': 'application/json',
      },
      body: payload
    });
    console.log(`Response Status: ${resMissing.status}`);
    const jsonMissing = await resMissing.json();
    console.log(`Response Payload:`, jsonMissing);

  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

runTests();
