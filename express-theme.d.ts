import * as express from 'express';
export interface IThemeOptions {
    /**
     * current theme name
     */
    theme: string;
}
export interface IThemePackage {
    name: string;
    description?: string;
    version: string;
}
export interface IThemeRequestObject {
    name: string;
    path: string;
    packagePath: string;
    package: IThemePackage;
    publicPath: string;
}
export interface IThemePackageCallback {
    (error?: Error, packageObj?: IThemePackage): any;
}
export interface IGetDirsCallback {
    (error?: Error, dirs?: string[]): any;
}
export interface IBooleanCallback {
    (error?: Error, result?: boolean): any;
}
/**
 * Extends express.Request to add new IThemeRequestObject
 */
export interface IRequest extends express.Request {
    theme: IThemeRequestObject;
}
/**
 * comes from express but uses own IRequest Interface
 */
export interface IRequestHandler {
    (req: IRequest, res: express.Response, next: Function): any;
}
export interface IAssets {
    render: IRequestHandler;
}
export declare class Filesystem {
    protected debug: debug.IDebugger;
    constructor(debugname: string);
    /**
     * Get all directories within directory
     * @see http://stackoverflow.com/a/18112359/1465919
     */
    protected getDirs(rootDir: string, cb: IGetDirsCallback): any;
    /**
     * Get all valid themes from theme path
     */
    protected fileExists(filePath: string, callback: IBooleanCallback): void;
}
export declare class Styles extends Filesystem implements IAssets {
    private sass;
    constructor();
    /**
     * build app.scss file with sass
     * TODO error handling
     * TODO locals: http://stackoverflow.com/a/31656540
     * TODO cache result
     * TODO move this tu custom class?
     */
    render(req: IRequest, res: any, next: any): any;
}
export declare class Scripts extends Filesystem implements IAssets {
    private browserify;
    private browserifyTransformTools;
    constructor();
    /**
     * build app.js file with browserify
     * TODO error handling
     * TODO locals
     * TODO cache result
     * TODO move this tu custom class?
     * @see https://github.com/ForbesLindesay/browserify-middleware
     */
    render(req: IRequest, res: any, next: any): any;
}
export declare class Views extends Filesystem implements IAssets {
    constructor();
    render(req: IRequest, res: any, next: any): void;
}
export declare class Theme extends Filesystem {
    private _router;
    private _options;
    private scripts;
    private views;
    private styles;
    options: IThemeOptions;
    router: express.Router;
    constructor(options: IThemeOptions);
    /**
     * Get all valid themes from theme path
     */
    getThemes(themesPath: string, callback: IGetDirsCallback): void;
    /**
     * set infos for theme in Request Object
     */
    private setInfo(req, res, next);
    /**
     * Get theme packageObj of theme dir
     */
    private getPackage(dir, callback);
}
