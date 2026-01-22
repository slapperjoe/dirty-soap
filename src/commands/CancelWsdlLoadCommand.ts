import { ICommand } from './ICommand';
import { LoadWsdlCommand } from './LoadWsdlCommand';

export class CancelWsdlLoadCommand implements ICommand {
    constructor(
        private readonly _loadWsdlCommand: LoadWsdlCommand
    ) { }

    async execute(_message: any): Promise<void> {
        this._loadWsdlCommand.cancel();
    }
}
