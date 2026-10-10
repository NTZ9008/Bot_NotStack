// Each account/session owns its requests. Late responses cannot cross this boundary.
export class SessionRequests {
    private controller = new AbortController();
    capture(): AbortSignal {
        return this.controller.signal;
    }
    reset(): void {
        this.controller.abort();
        this.controller = new AbortController();
    }
}
export const sessionRequests = new SessionRequests();
