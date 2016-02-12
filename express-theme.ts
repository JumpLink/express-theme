import * as express from 'express';
import * as fs from 'fs-extra';
import * as async from 'async';
import * as path from 'path';
import * as _ from 'lodash';
import * as debugModule from 'debug';

const THEME_PACKAGE_FILENAME = "bower.json";
const THEMES_DIRNAME = "themes";
const THEME_PUBLIC_DIRNAME = "public";
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
	packagePath: string;
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

	protected getJson(dir, cb) {
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

	// TODO get variable overwrites from db 
	protected getSettings(req: IRequest, cb): any {
		var settings_data = {};
		// shopify like settings_schema.json file
		var settingsSchemaFilePath = path.join(req.theme.path, THEME_COPNFIG_DIRNAME, 'settings_schema.json');
		this.getJson(settingsSchemaFilePath, (err, schema) => {
			if (err && err !== null) { this.debug(err); return cb(err); }
			for (var i in schema) {
				if(schema[i].settings) {
					for (var def in schema[i].settings) {
						if(schema[i].settings[def].id && schema[i].settings[def].default) {
							settings_data[schema[i].settings[def].id] = schema[i].settings[def].default;
						}
					}
				}
			}
			return cb(null, settings_data);
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
		var renderFilePath = path.join(req.theme.publicPath, req.path);
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
		this.getSettings(req, (err, settings_data) => {
			var scss_string: string = '';
			if (err && err !== null) { this.debug(err); return cb(err); }
			for (var key in settings_data) {
				scss_string += '$'+key+': '+settings_data[key]+';\n';
			}
			this.debug(scss_string);
			return cb(null, scss_string);
		});
	}
}

export class Scripts extends Filesystem implements IAssets {

	// TODO remove
	private browserify = require('browserify-middleware');
	private browserifyTransformTools = require('browserify-transform-tools');

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
		var renderFilePath = path.join(req.theme.publicPath, req.path);
		this.debug(renderFilePath);
		var options = {};
		this.browserify(renderFilePath, options)(req, res, next);
	}

	public settings(req: IRequest, res, next): any {
		this.getSettings(req, (err, settings_data) => {
			if (err && err !== null) { this.debug(err); return next(err); }
			return res.json(settings_data);
		});
	}

}

export class Views extends Filesystem implements IAssets {

	constructor() {
		super('theme:views');
	}

	public render(req: IRequest, res, next) {
		this.debug("view", req.path);
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
		this._router.get('/'+THEME_STYLES_DIRNAME+'/app.scss', (req: IRequest, res, next) => {
			return this.styles.render(req, res, next);
		});

		/**
		 * render script file
		 */
		this._router.get('/'+THEME_SCRIPTS_DIRNAME+'/app.js', (req: IRequest, res, next) => {
			return this.scripts.render(req, res, next);
		});

		/**
		 * render settings.json file
		 */
		this._router.get('/'+THEME_SCRIPTS_DIRNAME+'/settings.json', (req: IRequest, res, next) => {
			return this.scripts.settings(req, res, next);
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

		/**
		 * set public path for theme
		 */
		this._router.use((req: IRequest, res, next) => {
			return express.static(req.theme.publicPath)(req, res, next);
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
	 * set infos for theme in Request Object
	 */
	private setInfo(req: IRequest, res, next) {
		var themesPath = path.join(req.app.get('views'), THEMES_DIRNAME);

		this.getThemes(themesPath, (err, themes) => {
			this.debug("themes", themes);
		});

		var themeName = this._options.theme;
		var themePath = path.join(req.app.get('views'), THEMES_DIRNAME, themeName);
		var themePackagePath = path.join(themePath, THEME_PACKAGE_FILENAME);
		var themePublicPath = path.join(themePath, THEME_PUBLIC_DIRNAME)

		fs.readJson(themePackagePath, (err: Error, themePackage: IThemePackage) => {
			if(err && err !== null) {
				this.debug(err);
				return next(err);
			}
			var theme:IThemeRequestObject = {
				name: themeName,
				path: themePath,
				packagePath: themePackagePath,
				package: themePackage,
				publicPath: themePublicPath,
			};
			req['theme'] = theme;
			this.debug(req['theme']);
			return next();
		});
	}

	/**
	 * Get theme packageObj of theme dir
	 */
	private getPackage(dir: string, callback: IThemePackageCallback) {
		var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
		fs.stat(packagePath, (err, stat) => {
			if (err && err !== null) {
				this.debug("error", err);
				return callback(err);
			}

			if (!stat.isFile()) {
				return callback(new Error(packagePath + " is not a file!"));
			}

			fs.readJson(packagePath, (err: Error, packageObj: IThemePackage) => {
				if (err && err !== null) {
					this.debug("error", err);
					return callback(err);
				}

				if(!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
					return callback(new Error("theme package file broken!"));
				}

				return callback(null, packageObj);
			});

		});
	}
}
