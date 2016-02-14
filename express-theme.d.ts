import * as express from 'express';
import * as fs from 'fs-extra';
export interface IThemeOptions {
    /**
     * current theme name
     */
    dirname: string;
    viewsPath: string;
    themesPath?: string;
    path?: string;
    publicPath?: string;
    packagePath?: string;
    configPath?: string;
    scriptsPath?: string;
    stylesPath?: string;
    templatesPath?: string;
    settingsSchemaPath?: string;
    settingsDataPath?: string;
}
export interface IThemePackage {
    name: string;
    description?: string;
    version: string;
}
export interface IThemeSettingsDataValues {
    [key: string]: number | string | boolean;
}
export interface IThemeSettingsPresets {
    [key: string]: IThemeSettingsDataValues;
}
export interface IThemeSettingsData {
    current: IThemeSettingsDataValues;
    presets: IThemeSettingsPresets;
}
export interface IThemeRequestObject {
    /**
     * Options for the Theme Class
     */
    options: IThemeOptions;
    /**
     * Current theme specific settings, e.g. variable overwrites
     */
    settings: Settings;
    /**
     * Package of the current theme, e.g. name, description and version of theme.
     */
    package: IThemePackage;
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
    protected readJson(dir: any, cb: any): void;
    protected readJsonSync: typeof fs.readJsonSync;
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
    private settings(req, cb);
}
export declare class Scripts extends Filesystem implements IAssets {
    private browserify;
    constructor();
    /**
     * build app.js file with browserify
     * TODO error handling
     * TODO cache result
     * TODO move this tu custom class?
     * @see https://github.com/ForbesLindesay/browserify-middleware
     */
    render(req: IRequest, res: any, next: any): any;
    settings(req: IRequest, res: any, next: any): any;
}
export declare class Templates extends Filesystem implements IAssets {
    constructor();
    render(req: IRequest, res: any, next: any): void;
}
/**
 * Claas for shopify like theme settings
 */
export declare class Settings extends Filesystem {
    private options;
    private strformat;
    private db;
    /**
     * Get presents part of shopify like settings_data.json file
     * TODO get variable overwrites from db
     * TODO cache file
     * @see https://docs.shopify.com/themes/theme-development/storefront-editor/settings-schema
     */
    private presets;
    private schema;
    constructor(options: IThemeOptions, cb: {
        (err?: Error, data?: IThemeSettingsData);
    });
    getData(cb: {
        (err: Error, data?: IThemeSettingsData): any;
    }): any;
    private replaceData(data, cb);
}
export declare class Theme extends Filesystem {
    router: express.Router;
    private package;
    private settings;
    private _options;
    private scripts;
    private templates;
    private styles;
    options: IThemeOptions;
    constructor(options: IThemeOptions);
    /**
     * Get all valid themes from theme path
     */
    getThemes(themesPath: string, callback: IGetDirsCallback): void;
    /**
     * Get theme packageObj of theme dir
     */
    private getPackage(dir, callback);
    /**
     * Syncronius version of getPackage
     */
    private getPackageSync(dir);
    /**
     * set request IThemeRequestObject for theme in Request Object
     */
    private setRequest(req, res, next);
}
