declare module '@parse/node-apn' {
  export class Provider {
    constructor(options: { token: { key: string; keyId: string; teamId: string }; production: boolean })
    send(notification: Notification, device: string | string[]): Promise<{
      sent: Array<{ device: string }>
      failed: Array<{ device: string; status?: string | number; response?: { reason?: string } }>
    }>
    shutdown(): void
  }
  export class Notification {
    topic: string
    pushType: string
    priority: number
    payload: Record<string, unknown>
  }
}
