import { safeGetItem, safeSetItem } from '../../utils/storageUtils';
import { ProcessLane, ProcessStreamItem, ProcessStreamStatus } from './processHubData';

export const PROCESS_STREAM_KEY = 'forms-hub:submission-stream';
export const PROCESS_STREAM_UPDATED_EVENT = 'forms-hub:submission-stream-updated';
export const LEDGER_VISIBLE_STATUSES: ProcessStreamStatus[] = ['queued', 'processing', 'complete', 'failed'];

type StreamWriteOptions = {
  broadcast?: boolean;
};

type StreamItemSeed = {
  id?: string;
  lane?: ProcessLane;
  lastEvent?: string;
  processTitle: string;
  startedAt?: string;
  status: ProcessStreamStatus;
  summary?: string;
};

export function isProcessStreamStatus(value: string): value is ProcessStreamStatus {
  return value === 'queued' || value === 'awaiting_human' || value === 'processing' || value === 'complete' || value === 'failed';
}

export function readStoredStream() {
  const raw = safeGetItem(PROCESS_STREAM_KEY);
  if (!raw) {
    return [] as ProcessStreamItem[];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as ProcessStreamItem[];
    }

    return parsed.filter((item): item is ProcessStreamItem => {
      return Boolean(
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.processTitle === 'string' &&
        typeof item.startedAt === 'string' &&
        typeof item.status === 'string' &&
        isProcessStreamStatus(item.status),
      );
    });
  } catch {
    return [] as ProcessStreamItem[];
  }
}

export function writeStoredStream(items: ProcessStreamItem[], options: StreamWriteOptions = {}) {
  safeSetItem(PROCESS_STREAM_KEY, JSON.stringify(items));

  if (options.broadcast && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROCESS_STREAM_UPDATED_EVENT, { detail: { count: items.length } }));
  }
}

export function buildStreamItem(seed: StreamItemSeed): ProcessStreamItem {
  return {
    id: seed.id || `manual-${seed.status}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    lane: seed.lane || 'Request',
    lastEvent: seed.lastEvent || 'Added manually',
    processTitle: seed.processTitle,
    startedAt: seed.startedAt || new Date().toISOString(),
    status: seed.status,
    summary: seed.summary || 'Manual ledger entry',
  };
}

export function prependStoredStreamItem(item: ProcessStreamItem, maxItems: number) {
  const current = readStoredStream();
  const next = [item, ...current].slice(0, maxItems);
  writeStoredStream(next, { broadcast: true });
  return next;
}

export function createLedgerSeed(status: ProcessStreamStatus, source: 'demo' | 'manual') {
  const prefix = source === 'demo' ? 'Demo' : 'Manual';

  switch (status) {
    case 'queued':
      return {
        lastEvent: source === 'demo' ? 'Injected from demo tools' : 'Added from ledger',
        processTitle: `${prefix} queued submission`,
        summary: 'Queued placeholder entry',
      };
    case 'processing':
      return {
        lastEvent: source === 'demo' ? 'Injected from demo tools' : 'Added from ledger',
        processTitle: `${prefix} processing submission`,
        summary: 'Processing placeholder entry',
      };
    case 'complete':
      return {
        lastEvent: source === 'demo' ? 'Injected from demo tools' : 'Added from ledger',
        processTitle: `${prefix} completed submission`,
        summary: 'Completed placeholder entry',
      };
    case 'failed':
      return {
        lastEvent: source === 'demo' ? 'Injected from demo tools' : 'Added from ledger',
        processTitle: `${prefix} attention-needed submission`,
        summary: 'Attention-needed placeholder entry',
      };
    case 'awaiting_human':
    default:
      return {
        lastEvent: source === 'demo' ? 'Injected from demo tools' : 'Added from ledger',
        processTitle: `${prefix} awaiting-input submission`,
        summary: 'Awaiting-input placeholder entry',
      };
  }
}