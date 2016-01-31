import * as express from "express";
export declare class Theme {
    options: any;
    private router;
    constructor(options: any);
    express(meters: number): express.RequestHandler;
}
