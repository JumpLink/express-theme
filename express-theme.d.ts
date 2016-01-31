import * as express from 'express';
export interface ThemeOptions {
    /**
     * path of view files to render
     */
    views: string;
    /**
     * view engine, e.g. jade
     */
    viewEngine: string;
    /**
     * environment, development or production
     */
    env: string;
    /**
     * themes folder name
     */
    themes: string;
    /**
     * current theme name
     */
    theme: string;
    /**
     * path of themes
     */
    themesPath?: string;
    /**
     * path of current theme
     */
    themePath?: string;
    /**
     * path of package file of current theme
     */
    themePackagePath?: string;
}
export declare class Theme {
    private _router;
    private _options;
    options: ThemeOptions;
    router: express.Router;
    constructor(options: ThemeOptions);
    /**
     * Get all valid themes from theme path
     */
    private getThemes(callback);
    /**
     * Get theme packageObj of theme dir
     */
    private getThemePackage(dir, callback);
    /**
     * Get all directories within directory
     * @see http://stackoverflow.com/a/18112359/1465919
     */
    private getDirs(rootDir, cb);
}
