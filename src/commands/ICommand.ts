
export interface ICommand {
    execute(message: any): Promise<any> | any;
}
