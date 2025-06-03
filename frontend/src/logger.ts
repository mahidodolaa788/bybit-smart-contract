let logBuffer: string[] = [];
let debounceTimer: NodeJS.Timeout | null = null;
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

export function debounceLog(message: string) {
  logBuffer.push(message);

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    flushLogs();
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

function stringifyArg(arg: any) {
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
}

export const logger = {
  log: (...args: any[]) => {
    console.log(...args);
    const message = args.map(stringifyArg).join(' ');
    debounceLog(message);
  },
  error: (...args: any[]) => {
    console.error(...args);
    const message = args.map(stringifyArg).join(' ');
    debounceLog(message);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
    const message = args.map(stringifyArg).join(' ');
    debounceLog(message);
  }
};
