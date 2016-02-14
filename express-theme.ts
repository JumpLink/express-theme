import * as express from 'express';
import * as fs from 'fs-extra';
import * as async from 'async';
import * as path from 'path';
import * as _ from 'lodash';
import * as debugModule from 'debug';
import nedb = require('nedb');

const THEME_PACKAGE_FILENAME = "bower.json";
const THEME_SETTINGS_SCHEMA_FILENAME = "settings_schema.json";
const THEME_SETTINGS_DATA_FILENAME = "settings_data.json.db";
const THEMES_DIRNAME = "themes";
const THEME_PUBLIC_DIRNAME = "assets";
const THEME_TEMPLATES_DIRNAME = "templates";
const THEME_SCRIPTS_DIRNAME = "scripts";
const THEME_CONFIG_DIRNAME = "config";
const THEME_STYLES_DIRNAME = "styles";

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
	[key:string]:number|string|boolean;
}

// default values from settingsSchema
export interface IThemeSettingsPresets {
	[key:string]:IThemeSettingsDataValues; 
}

export interface IThemeSettingsData {
	current: IThemeSettingsDataValues; // overwrites
	presets: IThemeSettingsPresets; // default values from settingsSchema
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
	(
		error?: Error,
		packageObj?: IThemePackage
	): any
}

export interface IGetDirsCallback {
	(
		error?: Error,
		dirs?: string[]
	): any
}

export interface IBooleanCallback {
	(
		error?: Error,
		result?: boolean
	): any
}

/**
 * Extends express.Request to add new IThemeRequestObject
 */
export interface IRequest extends express.Request {
	theme: IThemeRequestObject
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


export class Filesystem {

	protected debug:debug.IDebugger;

	constructor(debugname:string) {
		this.debug = debugModule(debugname);
	}
	/**
	 * Get all directories within directory
	 * @see http://stackoverflow.com/a/18112359/1465919
	 */
	protected getDirs(rootDir: string, cb: IGetDirsCallback): any {
		this.debug(rootDir);
		fs.readdir(rootDir, (err: Error, files: string[]) => {
			var dirs: string[] = [];
			if (err && err !== null) {
				this.debug("error", err);
				return cb(err);
			}
			async.map<string, string>(files, (file, callback) => {
				if (file[0] === '.') {
					return callback(null, null);
				}
				var filePath = rootDir + '/' + file;
				fs.stat(filePath, (err, stat) => {
					if (err && err !== null) {
						return cb(err);
					}
					if (stat.isDirectory()) {
						return callback(null, file);
					}
					return callback(null, null);
				});
			}, (err, results) => {
				if (err && err !== null) {
					return cb(err);
				}
				async.filter(results, (file, callback) => {
					callback(file !== null);
				}, (results) => {
					cb(err, results);
				});
				
			});
		});
	}

	/**
	 * Get all valid themes from theme path
	 */
	protected fileExists(filePath: string, callback: IBooleanCallback) {
		fs.stat(filePath, (err, stat) => {
			if (err && err !== null) {
				this.debug(err);
				return callback(err, false);
			}
			if (stat.isFile()) {
				return callback(null, true);
			}
			return callback(null, false);
		});
	}

	protected readJson(dir, cb) {
		// this.debug('transform variables.json');
		this.fileExists(dir, (err, exists) => {
			if (exists !== true) { return cb(new Error(dir+" Not Found")); }
			if (err && err !== null) { return cb(err); }
			fs.readJson(dir, (err, data) => {
				if (err && err !== null) { return cb(err, {}); }
				return cb(null, data);
			});
		});
	}
    
	protected readJsonSync = fs.readJsonSync;
}

export class Styles extends Filesystem implements IAssets {

	private sass = require('node-sass');

	constructor() {
		super('theme:styles')
	}

	/**
	 * build app.scss file with sass
	 * TODO error handling
	 * TODO locals: http://stackoverflow.com/a/31656540
	 * TODO cache result
	 * TODO move this tu custom class?
	 */
	public render(req: IRequest, res, next): any {
		var renderFilePath = path.join(req.theme.options.path, req.path);
        this.debug(renderFilePath);
		this.fileExists(renderFilePath, (err, exists) => {
			if (exists !== true ) { this.debug("Not Found", renderFilePath, req.path); return next(); }
            if (err && err !== null) { return next(err); }

			fs.readFile(renderFilePath, 'utf8', (err, scss_string) => {
				if (err && err !== null) { return next(err); }
				this.settings(req, (err, scss_vars_string) => {
					if(err && err !== null) { return next(err); }
                    var options = {
						data: scss_vars_string+scss_string,
						includePaths: [
							req.theme.options.stylesPath,
                            path.join(req.theme.options.path, 'node_modules')
						],
                    }
                    this.debug(options);
					this.sass.render(options, (err, result) => {
						if(err && err !== null) { return next(err); }
						this.debug("send " + req.path);
						res.set('Content-Type', 'text/css');
						res.set('Cache-Control', 'max-age=0');
						return res.send(result.css);
					});
				})

			});
		});
	}

	private settings(req: IRequest, cb: {(err:Error, scss_string?:string)}): any {
		var scss_string: string = '';
        req.theme.settings.getData((err:Error, data?: IThemeSettingsData) => {
            if(err && err !== null) { return cb(err); }
            for (var key in data.current) {
                scss_string += '$'+key+': '+data.current[key]+';\n';
            }
            this.debug(scss_string);
            return cb(null, scss_string);
        });
	}
}

export class Scripts extends Filesystem implements IAssets {

	private browserify = require('browserify-middleware');

	constructor() {
		super('theme:scripts');
	}

	/**
	 * build app.js file with browserify
	 * TODO error handling
	 * TODO cache result
	 * TODO move this tu custom class?
	 * @see https://github.com/ForbesLindesay/browserify-middleware
	 */
	public render(req: IRequest, res, next): any {
		var renderFilePath = path.join(req.theme.options.path, req.path);
		this.debug(renderFilePath);
		var options = {};
		this.browserify(renderFilePath, options)(req, res, next);
	}

	public settings(req: IRequest, res, next): any {
        req.theme.settings.getData((err:Error, data?: IThemeSettingsData) => {
            if(err && err !== null) { next(err); }
            return res.json(data.current);
        });
		
	}

}

export class Templates extends Filesystem implements IAssets {

	constructor() {
		super('theme:templates');
	}

	public render(req: IRequest, res, next) {
		var renderFilePath = path.join(req.theme.options.templatesPath, req.path + '.jade');
        this.debug(renderFilePath);
		this.fileExists(renderFilePath, (err, exists) => {
			if (exists !== true ) { this.debug("Not Found", renderFilePath, req.path); return next(); }
            if (err && err !== null) { return next(err); }
            req.theme.settings.getData((err, data) => {
               if(err && err !== null) { return next(err); }
               res.render(renderFilePath, { settings: data.current });
            });
			
		});
	};
}

export class Settings extends Filesystem {
    private strformat = require('strformat');
    private db:nedb;
    
	/** 
     * Get presents part of shopify like settings_data.json file
	 * TODO get variable overwrites from db
	 * TODO cache file
     * @see https://docs.shopify.com/themes/theme-development/storefront-editor/settings-schema
	 */ 
	get presets(): IThemeSettingsPresets {
        var presets: IThemeSettingsPresets = {
            'Default': {}
        }
		var schema = this.readJsonSync(this.options.settingsSchemaPath);
        for (var i in schema) {
            if(schema[i].settings) {
                for (var def in schema[i].settings) {
                    if(schema[i].settings[def].id && typeof(schema[i].settings[def].default) !== 'undefined') {
                        presets['Default'][schema[i].settings[def].id] = schema[i].settings[def].default;
                    }
                }
            }
        }
        // replace placeholders
        for (var key in presets['Default']) {
            if(_.isString(presets['Default'][key])) {
                this.debug("replace placeholder", presets['Default'][key]);
                presets['Default'][key] = this.strformat(presets['Default'][key], presets['Default']);
            }
            
        }       
        return presets;
	}
    
    getCurrent(): any {

    }

	constructor(private options:IThemeOptions) {
		super('theme:settings');
        this.db = new nedb({ filename: this.options.settingsDataPath, autoload: true });
	}
    
    public getData(cb: {(err:Error, data?:IThemeSettingsData):any}):any {
        this.debug('getData');
        this.db.find({}, (err:Error, data:IThemeSettingsData) => {
            if(err && err !== null) {
                this.debug(err);
                return cb(err, data);
            }
             this.debug(data);
            // overwrite presets result from settings_schema.json file
            data.presets = this.presets;
            if(!data.current) {
                data.current = {};
            }
            for (var key in data.presets['Default']) {
                // if new value comes from schema, injet it to current
                if (!data.current.hasOwnProperty(key)) {
                    data.current[key] = data.presets['Default'][key];
                    
                }
            }
            return cb(err, data);
        });
    }
}

export class Theme extends Filesystem {
	public router: express.Router = express.Router();
    
    private package: IThemePackage;
    private settings: Settings;
    private _options: IThemeOptions;
    
	private scripts: Scripts = new Scripts();
	private templates: Templates = new Templates();
	private styles: Styles = new Styles();

	public set options(options: IThemeOptions) {
		this._options = options;
        this._options.themesPath = path.join(this._options.viewsPath, THEMES_DIRNAME);
		this._options.path = path.join(this._options.themesPath, this._options.dirname);
        this._options.packagePath = path.join(this._options.path, THEME_PACKAGE_FILENAME);
		this._options.publicPath = path.join(this._options.path, THEME_PUBLIC_DIRNAME);
        this._options.configPath = path.join(this._options.path, THEME_CONFIG_DIRNAME);
        this._options.scriptsPath = path.join(this._options.path, THEME_SCRIPTS_DIRNAME);
        this._options.stylesPath = path.join(this._options.path, THEME_STYLES_DIRNAME);
        this._options.templatesPath = path.join(this._options.path, THEME_TEMPLATES_DIRNAME);
        this._options.settingsSchemaPath = path.join(this._options.configPath, THEME_SETTINGS_SCHEMA_FILENAME);
        this._options.settingsDataPath = path.join(this._options.configPath, THEME_SETTINGS_DATA_FILENAME);
	   this.debug(this._options);
    }
    
    public get options():IThemeOptions {
        return this._options;
    }

	constructor(options: IThemeOptions) {
		super('theme:theme');
		this.options = options;
        this.package = this.getPackageSync(this.options.packagePath);
        this.settings = new Settings(this.options);

		// inject theme stuff to request
		this.router.use((req: IRequest, res, next) => {
			this.setRequest(req, res, next);
		});

		/**
		 * render style file
		 */
		this.router.get('/'+THEME_PUBLIC_DIRNAME+'/'+THEME_STYLES_DIRNAME+'/app.scss', (req: IRequest, res, next) => {
			this.debug('styles', req.path);
            return this.styles.render(req, res, next);
		});

		/**
		 * render script file
		 */
		this.router.get('/'+THEME_PUBLIC_DIRNAME+'/'+THEME_SCRIPTS_DIRNAME+'/app.js', (req: IRequest, res, next) => {
			this.debug('scripts', req.path);
            return this.scripts.render(req, res, next);
		});

		/**
		 * render settings.json file
		 */
		this.router.get('/'+THEME_PUBLIC_DIRNAME+'/'+THEME_SCRIPTS_DIRNAME+'/settings.json', (req: IRequest, res, next) => {
			this.debug('settings.json');
            return this.scripts.settings(req, res, next);
		});

		/**
		 * set public path for theme
		 */
		this.router.use('/'+THEME_PUBLIC_DIRNAME, (req: IRequest, res, next) => {
            this.debug('public');
			return express.static(req.theme.options.publicPath)(req, res, next);
		});

		/**
		 * render view file
		 */
		this.router.use((req: IRequest, res, next) => {
			return this.templates.render(req, res, next);
		});

		/**
		 * render index.jade file
		 */
		this.router.get('/', (req:IRequest, res, next) => {
			return res.render(path.join(req.theme.options.templatesPath, 'index'), { title: 'Express' });
		});
        
		this.router.use((err, req: IRequest, res, next) => {
            this.debug(req.path, err);
			res.status(500).send(req.path +'\n'+ err);
		});
 
	}

	/**
	 * Get all valid themes from theme path
	 */
	public getThemes(themesPath: string, callback: IGetDirsCallback) {
		this.getDirs(themesPath, (error, dirs) => {
			if (error) {
				this.debug("error", error);
				return callback(error);
			}
			this.debug("getThemes dirs", dirs);

			async.filter(dirs, (dir, callback) => {
				this.getPackage(path.join(themesPath, dir), (err, packageObj) => {
					if (err && err !== null) {
						this.debug("error", err);
						return callback(false);
					}
					return callback(true);
				});
			}, (results) => {
				return callback(null, results);
			});
		});
	}

	/**
	 * Get theme packageObj of theme dir
	 */
	private getPackage(dir: string, callback: IThemePackageCallback) {
		this.readJson(dir, (err: Error, packageObj: IThemePackage) => {
			if (err && err !== null) { this.debug(err); return callback(err); }

			if(!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
				return callback(new Error("theme package file broken!"));
			}

			return callback(null, packageObj);
		});
	}
    
	/**
	 * Syncronius version of getPackage
	 */
	private getPackageSync(dir: string): IThemePackage {
		var packageObj = this.readJsonSync(dir);
        if(!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
            throw new Error("theme package file broken!");
        }
		return packageObj;
	}

	/**
	 * set request IThemeRequestObject for theme in Request Object
	 */
	private setRequest(req: IRequest, res, next) {
        var theme:IThemeRequestObject = {
            options: this.options,
            settings: this.settings,
            package: this.package,
        };
        req.theme = theme;
        return next();
	}
}
