import * as express from 'express';
export interface ThemeOptions {
    /**
     * themes folder name
     */
    themes: string;
    /**
     * current theme name
     */
    theme: string;
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
    private fileExists(filePath, callback);
    /**
     * Get all valid themes from theme path
     */
    private getThemes(themesPath, callback);
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
