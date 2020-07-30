// from https://medium.com/@benlesh/promise-cancellation-is-dead-long-live-promise-cancellation-c6601f1f5082
interface CancelToken {
  promise: Promise<string>;
  reason?: string;
}

export interface Canceler {
  /**
   * a promise that resolves when cancel() is called
   */
  token: CancelToken;

  /**
   * call this to cancel requests (by resolving the token promise)
   */
  cancel: (reason: string) => void;
}

export function createCanceler(): Canceler {
  let cancel: (reason: string) => void = () => {};
  const token: CancelToken = {
    promise: new Promise((resolve) => {
      cancel = (reason) => {
        // the reason property can be checked
        // synchronously to see if you're cancelled
        token.reason = reason;
        resolve(reason);
      };
    }),
  };
  return { token, cancel };
}

//TODO comments for these functions
export function resetCanceler(canceler: Canceler) {
  const newCanceler = createCanceler();
  canceler.token = newCanceler.token;
  canceler.cancel = newCanceler.cancel;
}

export const cancelAllRequestsToken = createCanceler();
