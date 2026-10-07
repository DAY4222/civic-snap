export type BackendErrorCode =
  | 'disabled'
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'rate-limited'
  | 'payload-too-large'
  | 'server'
  | 'invalid-response';

export class BackendError extends Error {
  constructor(
    message: string,
    readonly code: BackendErrorCode,
    readonly status?: number
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PostJsonOptions = {
  anonKey: string;
  fetchImpl?: FetchImpl;
  signal?: AbortSignal;
  timeoutMs: number;
};

/** POSTs JSON to an Edge Function and maps every failure to a BackendError code. */
export async function postJson(url: string, body: unknown, options: PostJsonOptions) {
  const abortSignal = createTimeoutSignal(options.signal, options.timeoutMs);

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.anonKey}`,
        'Content-Type': 'application/json',
        apikey: options.anonKey,
      },
      signal: abortSignal.signal,
      body: JSON.stringify(body),
    });
  } catch {
    if (abortSignal.didTimeout()) throw new BackendError('The request took too long.', 'timeout');
    if (options.signal?.aborted) throw new BackendError('The request was cancelled.', 'cancelled');
    // The request never reached the service: no connection, or the backend is down or paused.
    throw new BackendError('Could not reach the service.', 'offline');
  } finally {
    abortSignal.cleanup();
  }

  if (response.status === 429) {
    throw new BackendError('The daily limit has been reached.', 'rate-limited', 429);
  }
  if (response.status === 503) {
    throw new BackendError('The service is temporarily unavailable.', 'offline', 503);
  }
  if (!response.ok) {
    throw new BackendError('The service returned an error.', 'server', response.status);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new BackendError('The service returned invalid JSON.', 'invalid-response');
  }
}

function createTimeoutSignal(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();

  parentSignal?.addEventListener('abort', abort);
  if (parentSignal?.aborted) {
    controller.abort();
  }

  return {
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    },
    didTimeout: () => timedOut,
    signal: controller.signal,
  };
}
