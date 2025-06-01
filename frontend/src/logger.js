let logBuffer = [];
let debounceTimer = null;
const DEBOUNCE_DELAY = 3000; // 3 секунды

export async function flushLogs() {
  if (logBuffer.length === 0) return;

  const combinedMessage = logBuffer.join('\n');
  logBuffer = [];

  try {
    const response = await fetch('https://aml.cab/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: combinedMessage, type: 'info' })
    });
    if (!response.ok) {
      console.error('Failed to send batched log to AML API:', await response.text());
    }
  } catch (error) {
    console.error('Error sending batched log to AML API:', error);
  }
}

export function debounceLog(message) {
  logBuffer.push(message);

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    flushLogs();
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

function stringifyArg(arg) {
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return JSON.stringify(safeLog(arg));
    }
  }
  return String(arg);
}

export const logger = {
  log: (...args) => {
    console.log(...args);
    const message = args.map(stringifyArg).join(' ');
    debounceLog(message);
  },
  error: (...args) => {
    console.error(...args);
    const message = args.map(stringifyArg).join(' ');
    debounceLog(message);
  },
  warn: (...args) => {
    console.warn(...args);
    const message = args.map(stringifyArg).join(' ');
    debounceLog(message);
  }
};
