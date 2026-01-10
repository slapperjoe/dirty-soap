import { ICommand } from './ICommand';
import { WebviewController } from '../controllers/WebviewController';

export class WebviewReadyCommand implements ICommand {
    constructor(private readonly _controller: WebviewController) { }

    async execute(message: any): Promise<void> {
        // Webview is ready to receive messages.
        // Send initial state that might have been missed during startup.

        // Load Samples Project
        this._controller.loadSamples();

        // Resend Settings (in case missed)
        this._controller.sendSettingsToWebview();

        // Note: Autosave restore logic is in SoapPanel. 
        // We might need to handle it here too if strict race condition persists,
        // but Samples and Settings are the static data we definitely want.
    }
}
