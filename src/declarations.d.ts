declare module "prettier" {
    namespace doc {
        namespace builders {
            type DocCommand = any;
            const join: any;
            const indent: any;
            const hardline: any;
            const line: any;
            const group: any;
        }
    }

    function format(source: string, options?: any): Promise<string>;
}
declare module "prettier/parser-babel" {
    export const parsers: Record<string, any>;
}
declare module "prettier/parser-typescript" {
    export const parsers: Record<string, any>;
}
