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

export const logger = {
  log: (...args) => {
    console.log(...args);
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    debounceLog(message);
  },
  error: (...args) => {
    console.error(...args);
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    debounceLog(message); // Можно доработать для ошибок отдельным буфером, если нужно
  },
  warn: (...args) => {
    console.warn(...args);
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    debounceLog(message);
  }
};