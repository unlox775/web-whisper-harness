/**
 * Validate a Groq API key by making a test request to the API
 * 
 * @param {string} apiKey - The Groq API key to validate (format: gsk_...)
 * @returns {Promise<{valid: boolean, reason?: string}>} Validation result
 */
export async function validateKey(apiKey) {
  // Check basic format
  if (!apiKey || typeof apiKey !== 'string') {
    return {
      valid: false,
      reason: 'Key format incorrect'
    };
  }

  if (!apiKey.startsWith('gsk_')) {
    return {
      valid: false,
      reason: 'Key format incorrect'
    };
  }

  // Test the key with a minimal request to Groq
  // We'll use the models endpoint as a lightweight test
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for validation

    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        valid: false,
        reason: 'Invalid API key'
      };
    }

    if (response.status >= 500) {
      return {
        valid: false,
        reason: 'Groq service unavailable'
      };
    }

    return {
      valid: false,
      reason: `Unexpected response: ${response.status}`
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        valid: false,
        reason: 'Network error'
      };
    }

    return {
      valid: false,
      reason: 'Network error'
    };
  }
}
