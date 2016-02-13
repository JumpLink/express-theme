import * as express from 'express';
import * as fs from 'fs-extra';
import * as async from 'async';
import * as path from 'path';
import * as _ from 'lodash';
import * as debugModule from 'debug';

const THEME_PACKAGE_FILENAME = "bower.json";
const THEMES_DIRNAME = "themes";
const THEME_PUBLIC_DIRNAME = "assets";
const THEME_VIEWS_DIRNAME = "views";
const THEME_SCRIPTS_DIRNAME = "scripts";
const THEME_COPNFIG_DIRNAME = "config";
const THEME_STYLES_DIRNAME = "styles";

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
	settings: Object;
	package: IThemePackage;
	publicPath: string;
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
		var renderFilePath = path.join(req.theme.path, req.path);
		this.fileExists(renderFilePath, (err, exists) => {
			if (exists !== true || (err && err !== null)) { return next(err); }

			fs.readFile(renderFilePath, 'utf8', (err, scss_string) => {
				if (err && err !== null) { return next(err); }
				this.settings(req, (err, scss_vars_string) => {
					if(err && err !== null) { return next(err); }
					this.sass.render({
						data: scss_vars_string+scss_string,
						includePaths: [
							path.join(req.theme.publicPath, THEME_STYLES_DIRNAME),
						],
					}, (err, result) => {
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

	private settings(req: IRequest, cb): any {
		var scss_string: string = '';
		for (var key in req.theme.settings) {
			scss_string += '$'+key+': '+req.theme.settings[key]+';\n';
		}
		this.debug(scss_string);
		return cb(null, scss_string);
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
		this.debug(req.path);
		var renderFilePath = path.join(req.theme.path, req.path);
		this.debug(renderFilePath);
		var options = {};
		this.browserify(renderFilePath, options)(req, res, next);
	}

	public settings(req: IRequest, res, next): any {
		return res.json(req.theme.settings);
	}

}

export class Views extends Filesystem implements IAssets {

	constructor() {
		super('theme:views');
	}

	public render(req: IRequest, res, next) {
		this.debug(req.path);
		var renderFilePath = path.join(req.theme.path, THEME_VIEWS_DIRNAME, req.path + '.jade');
		this.fileExists(renderFilePath, (err, exists) => {
			if (exists !== true || (err && err !== null)) { return next(); }
			return res.render(renderFilePath, { title: 'Express' });
		});
	};
}

export class Theme extends Filesystem {
	private _router: express.Router = express.Router();
	private _options: IThemeOptions;
	private scripts: Scripts = new Scripts();
	private views: Views = new Views();
	private styles: Styles = new Styles();
	private strformat = require('strformat');

	set options(options: IThemeOptions) {
		this._options = options;
	}

	get router(): express.Router {
		return this._router;
	}

	constructor(options: IThemeOptions) {
		super('theme:theme');
		this.options = options;

		// get infos for theme(s)
		this._router.use((req: IRequest, res, next) => {
			this.setInfo(req, res, next);
		});

		/**
		 * render style file
		 */
		this._router.get('/'+THEME_PUBLIC_DIRNAME+'/'+THEME_STYLES_DIRNAME+'/app.scss', (req: IRequest, res, next) => {
			return this.styles.render(req, res, next);
		});

		/**
		 * render script file
		 */
		this._router.get('/'+THEME_PUBLIC_DIRNAME+'/'+THEME_SCRIPTS_DIRNAME+'/app.js', (req: IRequest, res, next) => {
			return this.scripts.render(req, res, next);
		});

		/**
		 * render settings.json file
		 */
		this._router.get('/'+THEME_PUBLIC_DIRNAME+'/'+THEME_SCRIPTS_DIRNAME+'/settings.json', (req: IRequest, res, next) => {
			return this.scripts.settings(req, res, next);
		});

		/**
		 * set public path for theme
		 */
		this._router.use('/'+THEME_PUBLIC_DIRNAME, (req: IRequest, res, next) => {
			return express.static(req.theme.publicPath)(req, res, next);
		});

		/**
		 * render view file
		 */
		this._router.use((req: IRequest, res, next) => {
			return this.views.render(req, res, next);
		});

		/**
		 * render index.jade file
		 */
		this._router.get('/', (req, res, next) => {
			return res.render(path.join(req['theme'].path, 'views', 'index'), { title: 'Express' });
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
	 * TODO get variable overwrites from db
	 * TODO cache file
	 */ 
	private getSettingsData(themePath: string, cb): any {
		var settings_data = {};
		// shopify like settings_schema.json file
		var settingsSchemaFilePath = path.join(themePath, THEME_COPNFIG_DIRNAME, 'settings_schema.json');
		this.readJson(settingsSchemaFilePath, (err, schema) => {
			if (err && err !== null) { this.debug(err); return cb(err); }
			for (var i in schema) {
				if(schema[i].settings) {
					for (var def in schema[i].settings) {
						if(schema[i].settings[def].id && typeof(schema[i].settings[def].default) !== 'undefined') {
							settings_data[schema[i].settings[def].id] = schema[i].settings[def].default;
						}
					}
				}
			}
			// replace placeholders
			for (var key in settings_data) {
				if(_.isString(settings_data[key])) {
					this.debug("replace placeholder", settings_data[key]);
					settings_data[key] = this.strformat(settings_data[key], settings_data);
				}
				
			}
			return cb(null, settings_data);
		});
	}

	/**
	 * Get theme packageObj of theme dir
	 */
	private getPackage(dir: string, callback: IThemePackageCallback) {
		var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
		this.readJson(packagePath, (err: Error, packageObj: IThemePackage) => {
			if (err && err !== null) { this.debug(err); return callback(err); }

			if(!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
				return callback(new Error("theme package file broken!"));
			}

			return callback(null, packageObj);
		});
	}

	/**
	 * set infos for theme in Request Object
	 */
	private setInfo(req: IRequest, res, next) {
		var themesPath = path.join(req.app.get('views'), THEMES_DIRNAME);

		this.getThemes(themesPath, (err, themes) => {
			this.debug("themes", themes);
		});

		var themeName = this._options.theme;
		var themePath = path.join(req.app.get('views'), THEMES_DIRNAME, themeName);
		var themePublicPath = path.join(themePath, THEME_PUBLIC_DIRNAME);
		this.getSettingsData(themePath, (err: Error, settingsData) => {
			if(err && err !== null) { this.debug(err); return next(err); }
			this.getPackage(themePath, (err: Error, themePackage: IThemePackage) => {
				if(err && err !== null) { this.debug(err); return next(err); }
				var theme:IThemeRequestObject = {
					name: themeName,
					path: themePath,
					settings: settingsData,
					package: themePackage,
					publicPath: themePublicPath,
				};
				req['theme'] = theme;
				this.debug(req['theme']);
				return next();
			});
		});
	}
}
