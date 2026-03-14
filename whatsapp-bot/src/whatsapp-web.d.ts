declare module 'whatsapp-web.js' {
  export class Client {
    constructor(options?: Record<string, unknown>);
    on(event: string, callback: (...args: any[]) => void): void;
    initialize(): Promise<void>;
    sendMessage(chatId: string, text: string): Promise<unknown>;
  }
  export class LocalAuth {
    constructor(options?: Record<string, unknown>);
  }
}
