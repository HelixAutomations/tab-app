import { isInTeams } from '../isInTeams';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setGlobal(name: 'window' | 'document' | 'navigator', value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobal(name: 'window' | 'document' | 'navigator', descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }

  delete (globalThis as Record<string, unknown>)[name];
}

function installEnvironment(options?: {
  userAgent?: string;
  brands?: string[];
  search?: string;
  embedded?: boolean;
  referrer?: string;
  ancestorOrigins?: string[];
}) {
  const {
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    brands = [],
    search = '',
    embedded = false,
    referrer = '',
    ancestorOrigins = [],
  } = options || {};

  const win: Record<string, unknown> = {
    location: {
      search,
      ancestorOrigins,
    },
  };

  if (embedded) {
    win.self = {};
    win.top = {};
  } else {
    win.self = win;
    win.top = win;
  }

  setGlobal('window', win);
  setGlobal('document', { referrer });
  setGlobal('navigator', {
    userAgent,
    userAgentData: brands.length
      ? { brands: brands.map((brand) => ({ brand })) }
      : undefined,
  });
}

afterEach(() => {
  restoreGlobal('window', originalWindow);
  restoreGlobal('document', originalDocument);
  restoreGlobal('navigator', originalNavigator);
});

describe('isInTeams', () => {
  it('returns true for a Teams user agent', () => {
    installEnvironment({
      userAgent: 'Mozilla/5.0 Teams/26093.415.4620.1935',
    });

    expect(isInTeams()).toBe(true);
  });

  it('returns true for a Teams iframe when the referrer is teams.microsoft.com', () => {
    installEnvironment({
      embedded: true,
      referrer: 'https://teams.microsoft.com/',
    });

    expect(isInTeams()).toBe(true);
  });

  it('returns true for a Teams iframe when ancestor origins point to Teams', () => {
    installEnvironment({
      embedded: true,
      ancestorOrigins: ['https://teams.microsoft.com'],
    });

    expect(isInTeams()).toBe(true);
  });

  it('returns false for a generic iframe without Teams signals', () => {
    installEnvironment({
      embedded: true,
      referrer: 'https://example.com/',
    });

    expect(isInTeams()).toBe(false);
  });

  it('returns true for the explicit diagnostics query param', () => {
    installEnvironment({
      search: '?inTeams=1',
    });

    expect(isInTeams()).toBe(true);
  });
});