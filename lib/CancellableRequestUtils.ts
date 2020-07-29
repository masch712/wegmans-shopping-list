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

  /**
   * call this to clean the slate so you can send new requests again.
   */
  reset: () => void;
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

  const reset = () => {
    token.promise = new Promise((resolve) => {
      cancel = (reason) => {
        token.reason = reason;
        resolve(reason);
      };
    });
  };
  return { token, cancel, reset };
}
export const cancelAllRequestsToken = createCanceler();
