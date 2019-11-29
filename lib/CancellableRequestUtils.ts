// from https://medium.com/@benlesh/promise-cancellation-is-dead-long-live-promise-cancellation-c6601f1f5082
interface CancelToken {
  promise: Promise<string>;
  reason?: string;
}

export interface Canceler {
  token: CancelToken;
  cancel: (reason: string) => void;
}

export function createCanceler(): Canceler {
  let cancel: (reason: string) => void = () => {};
  const token: CancelToken = {
    promise: new Promise(resolve => {
      cancel = reason => {
        // the reason property can be checked
        // synchronously to see if you're cancelled
        token.reason = reason;
        resolve(reason);
      };
    })
  };

  return { token, cancel };
}
export const cancelAllRequestsToken = createCanceler();
