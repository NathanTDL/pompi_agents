/** The parts of noVNC's RFB client Pompi uses (the package ships no types). */
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string; username?: string; target?: string }; shared?: boolean; wsProtocols?: string[] });
    viewOnly: boolean;
    scaleViewport: boolean;
    clipViewport: boolean;
    resizeSession: boolean;
    showDotCursor: boolean;
    focusOnClick: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;
    disconnect(): void;
    sendCredentials(creds: { password?: string; username?: string }): void;
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    focus(options?: FocusOptions): void;
    blur(): void;
    clipboardPasteFrom(text: string): void;
  }
}
