declare module '@parse/node-apn' {
  export class Provider {
    constructor(options: { token: { key: string; keyId: string; teamId: string }; production: boolean })
    send(notification: Notification, device: string | string[]): Promise<{ failed: unknown[] }>
    shutdown(): void
  }
  export class Notification {
    topic: string
    pushType: string
    priority: number
    payload: Record<string, unknown>
  }
}
