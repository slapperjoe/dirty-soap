
export interface ICommand {
    execute(message: any): Promise<void> | void;
}
